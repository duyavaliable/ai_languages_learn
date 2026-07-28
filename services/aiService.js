import fs from 'fs';
import crypto from 'crypto';
import { fetchWithTimeoutRetryCircuit } from './aiWrapper.js';
import { aiResponseCache, buildCacheKey } from './cacheService.js';

const RAW_API_KEYS = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
const GEMINI_API_KEY = RAW_API_KEYS.split(',')[0]?.trim() || '';


const GEMINI_MODEL_TEXT = 'gemini-2.5-flash';

// ── Queue & Deduplication ──────────────────────────────────────────────────
class AsyncQueue {
  constructor(concurrency = 2) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  async enqueue(taskFn) {
    if (this.running >= this.concurrency) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await taskFn();
    } finally {
      this.running--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }
}

const geminiQueue = new AsyncQueue(2); // Max 2 concurrent Gemini API calls
const inflightGeminiRequests = new Map();

function getGeminiDeduplicationKey(systemInstruction, userPrompt, hasUserParts) {
  if (hasUserParts) return null; // Do not deduplicate multimodal requests
  const payload = `${systemInstruction || ''}|||${userPrompt || ''}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}
// ─────────────────────────────────────────────────────────────────────────────

const getGeminiListModelsEndpoint = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;

const getMaskedKey = (key) => {
  if (!key) return '(missing)';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
};

function ensureGeminiConfigured() {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is missing. Set GEMINI_API_KEY or GEMINI_API_KEYS in .env');
  }
}

export async function generateGeminiText({ systemInstruction, userPrompt, userParts = [], temperature = 0.6, maxOutputTokens = 1024, forceJsonOutput = false, cacheConfig = null, forceRegenerate = false }) {
  ensureGeminiConfigured();

  const hasUserParts = userParts && userParts.length > 0;
  
  // 1. Cache Lookup
  let cacheKey = null;
  if (cacheConfig && !hasUserParts) {
    cacheKey = buildCacheKey({
      model: GEMINI_MODEL_TEXT,
      version: cacheConfig.version,
      action: cacheConfig.action,
      input: userPrompt,
      config: { temp: temperature, tokens: maxOutputTokens }
    });

    if (!forceRegenerate) {
      const cachedResponse = aiResponseCache.get(cacheKey);
      if (cachedResponse) {
        console.log(`[Cache] HIT for ${cacheConfig.action} (key: ${cacheKey})`);
        return cachedResponse;
      }
    }
  }

  // 2. Deduplication
  const dedupKey = getGeminiDeduplicationKey(systemInstruction, userPrompt, hasUserParts);

  if (dedupKey && inflightGeminiRequests.has(dedupKey)) {
    console.log(`[Deduplication] generateGeminiText reusing inflight request for hash ${dedupKey.substring(0,8)}`);
    return inflightGeminiRequests.get(dedupKey);
  }

  const requestPromise = geminiQueue.enqueue(async () => {
    const currentKey = GEMINI_API_KEY;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_TEXT}:generateContent?key=${encodeURIComponent(currentKey)}`;
    const safeEndpoint = endpoint.replace(encodeURIComponent(currentKey), '***MASKED***');

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }, ...userParts]
        }
      ],
      generationConfig: {
        temperature,
        maxOutputTokens,
        thinkingConfig: { thinkingBudget: 0 } // Disable thinking tokens — avoids token budget drain and latency spike
      }
    };

    if (forceJsonOutput) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const response = await fetchWithTimeoutRetryCircuit(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, {
      timeoutMs: 28000,
      retries: 2,  // increased from 1 to 2 since queue smooths out traffic
      apiKey: currentKey,
      label: 'generateGeminiText'
    });

    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      if (!response.ok) {
        throw new Error(`Gemini request failed with status ${response.status} (non-JSON body)`);
      }
      throw new Error('Gemini request returned invalid JSON format');
    }

    const finishReason = data?.candidates?.[0]?.finishReason || null;
    if (finishReason && String(finishReason).toUpperCase().includes('MAX_TOKENS')) {
      console.error('[Gemini] ❌ Output TRUNCATED by token limit — JSON will be broken', {
        finishReason,
        model: GEMINI_MODEL_TEXT,
        maxOutputTokens,
        outputSoFarLength: (() => {
          try {
            return (data?.candidates || [])
              .flatMap(c => c?.content?.parts || [])
              .map(p => p?.text || '').join('').length;
          } catch { return -1; }
        })()
      });
      throw new Error(
        `Gemini output was cut off by token limit (maxOutputTokens=${maxOutputTokens}). ` +
        'Increase maxOutputTokens or shorten the prompt to get complete JSON.'
      );
    }

    if (!response.ok) {
      const apiMessage = data?.error?.message || `Gemini request failed with status ${response.status}`;
      console.error('[Gemini] generateContent failed', {
        model: GEMINI_MODEL_TEXT,
        status: response.status,
        endpoint: safeEndpoint,
        key: getMaskedKey(currentKey),
        error: data?.error || data
      });
      throw new Error(`${apiMessage} [current model: ${GEMINI_MODEL_TEXT}]`);
    }

    const output = (data?.candidates || [])
      .flatMap((candidate) => candidate?.content?.parts || [])
      .map((part) => part?.text || '')
      .join('')
      .trim();

    if (!output) {
      console.error('[Gemini] Empty output extracted from response', {
        candidatesCount: data?.candidates?.length,
        firstCandidateContent: data?.candidates?.[0]?.content
      });
      throw new Error('Gemini returned empty content');
    }

    if (cacheKey && !forceRegenerate && cacheConfig?.ttl) {
      aiResponseCache.set(cacheKey, output, cacheConfig.ttl);
      console.log(`[Cache] SAVED for ${cacheConfig.action} (key: ${cacheKey}, ttl: ${cacheConfig.ttl}ms)`);
    }

    return output;
  });

  if (dedupKey) {
    inflightGeminiRequests.set(dedupKey, requestPromise);
    requestPromise.finally(() => inflightGeminiRequests.delete(dedupKey)).catch(() => {});
  }

  return requestPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateGeminiJson — Dedicated JSON workflow service
//
// Responsibilities:
//   - Always enables forceJsonOutput (responseMimeType: application/json)
//   - Logs usageMetadata for token consumption diagnostics
//   - Warns on MAX_TOKENS without hard-stopping (parseJsonContent handles recovery)
//   - Returns raw string — caller is responsible for parseJsonContent()
//
// Use this for: speaking assessment, pronunciation feedback, exercise generation,
//               script rephrasing, scoring systems — all JSON-based workflows.
// ─────────────────────────────────────────────────────────────────────────────
export async function generateGeminiJson({ systemInstruction, userPrompt, userParts = [], temperature = 0.6, maxOutputTokens = 1024, timeoutMs = 28000, cacheConfig = null, forceRegenerate = false }) {
  ensureGeminiConfigured();

  const hasUserParts = userParts && userParts.length > 0;

  // 1. Cache Lookup
  let cacheKey = null;
  if (cacheConfig && !hasUserParts) {
    cacheKey = buildCacheKey({
      model: GEMINI_MODEL_TEXT,
      version: cacheConfig.version,
      action: cacheConfig.action,
      input: userPrompt,
      config: { temp: temperature, tokens: maxOutputTokens }
    });

    if (!forceRegenerate) {
      const cachedResponse = aiResponseCache.get(cacheKey);
      if (cachedResponse) {
        console.log(`[Cache] HIT for ${cacheConfig.action} (key: ${cacheKey})`);
        return cachedResponse;
      }
    }
  }

  // 2. Deduplication
  const dedupKey = getGeminiDeduplicationKey(systemInstruction, userPrompt, hasUserParts);

  if (dedupKey && inflightGeminiRequests.has(dedupKey)) {
    console.log(`[Deduplication] generateGeminiJson reusing inflight request for hash ${dedupKey.substring(0,8)}`);
    return inflightGeminiRequests.get(dedupKey);
  }

  const requestPromise = geminiQueue.enqueue(async () => {
    const currentKey = GEMINI_API_KEY;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_TEXT}:generateContent?key=${encodeURIComponent(currentKey)}`;
    const safeEndpoint = endpoint.replace(encodeURIComponent(currentKey), '***MASKED***');

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }, ...userParts]
        }
      ],
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: 'application/json',  // always JSON for this service
        thinkingConfig: { thinkingBudget: 0 } // Disable thinking tokens — avoids token budget drain and latency spike
      }
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const tStart = Date.now();

    const response = await fetchWithTimeoutRetryCircuit(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, {
      timeoutMs, // caller-supplied (default 28000; audio calls may pass 45000)
      retries: 2, // increased from 1 to 2 since queue smooths out traffic
      apiKey: currentKey,
      label: 'generateGeminiJson'
    });

    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      if (!response.ok) {
        throw new Error(`Gemini JSON request failed with status ${response.status} (non-JSON body)`);
      }
      throw new Error('Gemini JSON request returned invalid response format');
    }

    if (!response.ok) {
      const apiMessage = data?.error?.message || `Gemini request failed with status ${response.status}`;
      console.error('[GeminiJson] Request failed', {
        model: GEMINI_MODEL_TEXT,
        status: response.status,
        endpoint: safeEndpoint,
        key: getMaskedKey(currentKey),
        error: data?.error || data
      });
      throw new Error(`${apiMessage} [current model: ${GEMINI_MODEL_TEXT}]`);
    }

    // Bóc tách rawText trước khi trim — để đo chính xác độ dài gốc
    const rawText = (data?.candidates || [])
      .flatMap((candidate) => candidate?.content?.parts || [])
      .map((part) => part?.text || '')
      .join('');

    const output = rawText.trim();
    const usageMetadata = data?.usageMetadata || {};
    const finishReason = data?.candidates?.[0]?.finishReason || null;
    const geminiMs = Date.now() - tStart;

    if (finishReason && String(finishReason).toUpperCase().includes('MAX_TOKENS')) {
      // Cảnh báo — không throw ngay. Nếu JSON đã hoàn chỉnh thì parseJsonContent sẽ xử lý được.
      // Nếu JSON thực sự bị cụt, parseJsonContent sẽ throw lỗi rõ ràng ở tầng trên.
      console.warn('[GeminiJson] ⚠️ MAX_TOKENS flagged — JSON may be truncated', {
        finishReason,
        model: GEMINI_MODEL_TEXT,
        sentMaxTokens: maxOutputTokens,
        geminiMs,
        usageMetadata,
        rawTextLength: rawText.length,
        trimmedLength: output.length,
        tailBase64: Buffer.from(rawText.slice(-50)).toString('base64'),
        tailText: rawText.slice(-50)
      });
    }

    if (!output) {
      console.error('[GeminiJson] Empty output from response', {
        candidatesCount: data?.candidates?.length,
        usageMetadata
      });
      throw new Error('Gemini returned empty JSON content');
    }

    if (cacheKey && !forceRegenerate && cacheConfig?.ttl) {
      aiResponseCache.set(cacheKey, output, cacheConfig.ttl);
      console.log(`[Cache] SAVED for ${cacheConfig.action} (key: ${cacheKey}, ttl: ${cacheConfig.ttl}ms)`);
    }

    return output;
  });

  if (dedupKey) {
    inflightGeminiRequests.set(dedupKey, requestPromise);
    requestPromise.finally(() => inflightGeminiRequests.delete(dedupKey)).catch(() => {});
  }

  return requestPromise;
}



export const checkPronunciation = async (audioData, text, language) => {
  try {
    if (!audioData || typeof audioData !== 'string') {
      throw new Error('Pronunciation check currently expects transcription text in audioData when using Gemini REST mode');
    }

    const transcription = audioData;
    const accuracy = calculateSimilarity(transcription.toLowerCase(), text.toLowerCase());

    return {
      transcription,
      accuracy,
      feedback: accuracy > 0.8 ? 'Excellent pronunciation!' : `Keep practicing ${language || 'English'} pronunciation!`
    };
  } catch (error) {
    throw new Error('Failed to evaluate pronunciation: ' + error.message);
  }
};

export const validateVocabularyColumnsWithAI = async (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      items: [],
      warnings: []
    };
  }

  if (items.length > 150) {
    return {
      items,
      warnings: ['Skipped AI validation because row count is too high (>150).']
    };
  }

  const aiText = await generateGeminiJson({
    systemInstruction: [
      'You are a strict data normalization assistant for vocabulary tables.',
      'Input rows may have column shifts between word, pronunciation, and Vietnamese meaning.',
      'Return JSON array only, keep same number of rows and same order as input.',
      'Each row must include: word, pronunciation, meaning.',
      'Do not translate or invent content when missing data.',
      'If uncertain, keep original values.'
    ].join(' '),
    userPrompt: [
      'Normalize these rows into columns:',
      JSON.stringify(items.map((item) => ({
        word: String(item?.word || ''),
        pronunciation: String(item?.pronunciation || ''),
        meaning: String(item?.meaning || '')
      }))),
      'Return strict JSON array only. No markdown.'
    ].join('\n'),
    temperature: 0.1,
    maxOutputTokens: 4096
  });

  const parsed = parseJsonContent(aiText);
  if (!Array.isArray(parsed)) {
    throw new Error('AI validation response must be an array');
  }

  const normalized = items.map((original, index) => {
    const candidate = parsed[index] || {};
    return {
      ...original,
      word: normalizeGeneratedText(candidate?.word || original?.word),
      pronunciation: normalizeGeneratedText(candidate?.pronunciation || original?.pronunciation),
      meaning: normalizeGeneratedText(candidate?.meaning || original?.meaning)
    };
  });

  return {
    items: normalized,
    warnings: []
  };
};

function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function normalizeGeneratedText(value) {
  const text = String(value ?? '');
  return text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/^\s*\\n+/, '')
    .trim();
}



function parseJsonContent(rawContent) {
  const content = String(rawContent || '').trim();

  const tryParse = (candidate, source) => {
    if (!candidate) return null;
    try {
      return JSON.parse(candidate);
    } catch (err) {
      return null;
    }
  };

  const extractBalancedJson = (text) => {
    const firstObj = text.indexOf('{');
    const firstArr = text.indexOf('[');

    let start = -1;
    if (firstObj >= 0 && firstArr >= 0) {
      start = Math.min(firstObj, firstArr);
    } else {
      start = Math.max(firstObj, firstArr);
    }

    if (start < 0) return '';

    const open = text[start];
    const close = open === '{' ? '}' : ']';

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === open) depth += 1;
      if (ch === close) depth -= 1;

      if (depth === 0) {
        return text.substring(start, i + 1);
      }
    }

    return '';
  };



  const direct = tryParse(content, 'direct');
  if (direct !== null) return direct;

  // Some responses start with a plain label like "json\n{...}"
  const noJsonLabel = content.replace(/^\s*json\s*/i, '');
  if (noJsonLabel !== content) {
    const parsedNoLabel = tryParse(noJsonLabel, 'json-label-stripped');
    if (parsedNoLabel !== null) return parsedNoLabel;
  }

  // Try to extract JSON from markdown code blocks
  const markdownMatches = [
    content.match(/```json\s*([\s\S]*?)\s*```/i),
    content.match(/```\s*([\s\S]*?)\s*```/i)
  ];

  for (let i = 0; i < markdownMatches.length; i++) {
    const match = markdownMatches[i];
    if (match && match[1]) {
      const extracted = match[1].trim();


      const parsedMarkdown = tryParse(extracted, `markdown-block-${i + 1}`);
      if (parsedMarkdown !== null) return parsedMarkdown;
    }
  }

  // Balanced extraction handles extra text before/after JSON safely.
  const balanced = extractBalancedJson(content);
  if (balanced) {

    const parsedBalanced = tryParse(balanced, 'balanced-extraction');
    if (parsedBalanced !== null) return parsedBalanced;
  }

  // If all else fails, log detailed debugging info
  console.error('[parseJsonContent] ❌ All parsing attempts failed', {
    rawContentLength: content.length,
    rawContentPreview: content.substring(0, 500),
    rawContentEnd: content.length > 500 ? content.substring(content.length - 300) : '',
    hasMarkdownCodeBlock: /```/i.test(content),
    hasJsonStart: content.includes('{') || content.includes('['),
    contentType: content.substring(0, 50),
    containsError: content.toLowerCase().includes('error'),
    lines: content.split('\n').slice(0, 10)
  });

  throw new Error('AI did not return valid JSON');
}



function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

// New: Grade speech for pronunciation, fluency, grammar, vocabulary using VSTEP-style criteria
export async function gradeSpeechWithAI({
  audioPath,
  audioMimeType = 'audio/webm',
  speakingPrompt = '',
  standardTranscript = '',
  frontendTranscript = ''
}) {
  if (!audioPath) {
    throw new Error('Audio is required for grading');
  }

  const audioBuffer = fs.readFileSync(audioPath);
  const audioBase64 = audioBuffer.toString('base64');
  const promptText = String(speakingPrompt || '').trim().slice(0, 800);
  const transcriptText = String(standardTranscript || frontendTranscript || '').trim().slice(0, 800);

  const systemInstruction = [
    'You are a strict VSTEP Speaking examiner.',
    'Listen to the audio and grade the candidate response only.',
    'Do not copy the speaking prompt into the transcript.',
    'Return valid JSON only with keys: transcript, pronunciation_score, fluency_score, grammar_score, vocabulary_score, task_fulfillment_score, feedback, errors.',
    'feedback must be a non-empty array of short actionable bullets.',
    'errors must be an array of up to 10 items with word, issue, suggestion.'
  ].join(' ');

  const userPrompt = [
    `Speaking prompt: ${promptText || 'Not provided'}`,
    `Frontend transcript hint: ${transcriptText || 'Not provided'}`,
    'Score pronunciation, fluency, grammar, vocabulary, and task fulfillment fairly but strictly.',
    'Keep the transcript limited to the candidate speech you can hear from the audio.'
  ].join('\n');

  const parseSpeechGradeResult = (rawText) => {
    const parsed = parseJsonContent(rawText);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('AI response must be a JSON object');
    }

    const normalizeScore = (value, fieldName) => {
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0 || num > 100) {
        throw new Error(`${fieldName} must be a number between 0 and 100`);
      }
      return num;
    };

    const feedback = Array.isArray(parsed.feedback)
      ? parsed.feedback.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
      : [];

    if (feedback.length === 0) {
      throw new Error('feedback must be a non-empty array');
    }

    const errors = Array.isArray(parsed.errors)
      ? parsed.errors.slice(0, 10).map((item) => ({
        word: String(item?.word || '').trim(),
        issue: String(item?.issue || '').trim(),
        suggestion: String(item?.suggestion || '').trim()
      }))
      : [];

    return {
      transcript: String(parsed.transcript || parsed.standard_transcript || '').trim(),
      pronunciation_score: normalizeScore(parsed.pronunciation_score, 'pronunciation_score'),
      fluency_score: normalizeScore(parsed.fluency_score, 'fluency_score'),
      grammar_score: normalizeScore(parsed.grammar_score, 'grammar_score'),
      vocabulary_score: normalizeScore(parsed.vocabulary_score, 'vocabulary_score'),
      task_fulfillment_score: normalizeScore(parsed.task_fulfillment_score, 'task_fulfillment_score'),
      feedback,
      errors
    };
  };

  try {
    const aiText = await generateGeminiJson({
      systemInstruction,
      userPrompt,
      userParts: [
        {
          inlineData: {
            mimeType: audioMimeType || 'audio/webm',
            data: audioBase64
          }
        }
      ],
      temperature: 0.3,
      maxOutputTokens: 4096, // increased: thinkingBudget=0 so all tokens go to output
      timeoutMs: 45000 // audio multimodal needs extra decode + inference time
    });

    console.log('[gradeSpeechWithAI] Gemini response received', {
      responseLength: aiText.length,
      preview: aiText.substring(0, 200)
    });

    let gradeResult;
    try {
      gradeResult = parseSpeechGradeResult(aiText);
    } catch (parseErr) {
      console.error('[gradeSpeechWithAI] Failed to parse Gemini JSON', {
        error: parseErr.message,
        response: aiText.substring(0, 300)
      });

      const repairPrompt = [
        userPrompt,
        'Previous response was invalid or incomplete JSON.',
        'Return ONLY valid JSON with all required fields and numeric scores from 0 to 100.',
        'Do not include markdown or extra text.'
      ].join('\n');
      const repairedText = await generateGeminiJson({
        systemInstruction,
        userPrompt: repairPrompt,
        userParts: [
          {
            inlineData: {
              mimeType: audioMimeType || 'audio/webm',
              data: audioBase64
            }
          }
        ],
        temperature: 0.1,
        maxOutputTokens: 4096, // increased: thinkingBudget=0 so all tokens go to output
        timeoutMs: 45000 // audio multimodal needs extra decode + inference time
      });

      gradeResult = parseSpeechGradeResult(repairedText);
    }

    return {
      ...gradeResult,
      feedback: gradeResult.feedback.length > 0 ? gradeResult.feedback : ['Keep practicing to improve your speaking skills.']
    };
  } catch (err) {
    console.error('[gradeSpeechWithAI] Gemini call failed', {
      error: err.message
    });
    throw new Error('Failed to grade speech: ' + err.message);
  }
}

export const rephraseSpeakingFragment = async ({
  selectedText,
  originalScript,
  action = 'rewrite',
  context = ''
}) => {
  const safeSelectedText = String(selectedText || '').trim();
  const safeOriginalScript = String(originalScript || '').trim();
  const safeContext = String(context || '').trim();
  const safeAction = String(action || 'rewrite').trim().toLowerCase();

  if (!safeSelectedText) {
    throw new Error('selectedText is required');
  }

  const actionGuides = {
    simplify: 'Make the phrase simpler and easier to understand.',
    shorten: 'Make the phrase shorter while keeping the meaning.',
    rewrite: 'Rewrite the phrase to sound natural and clear.',
    formalize: 'Rewrite the phrase in a more formal tone.',
    easier_to_pronounce: 'Rewrite the phrase so it is easier to pronounce while keeping the meaning.'
  };

  const guide = actionGuides[safeAction] || actionGuides.rewrite;

  const aiText = await generateGeminiJson({
    systemInstruction: [
      'You are a speaking coach.',
      'Return JSON only: {"alternatives":["...","...","..."]}.',
      'Provide 3 natural, grammatically correct alternatives.'
    ].join(' '),
    userPrompt: [
      `Action: ${guide}`,
      `Selected phrase: ${safeSelectedText}`,
      `Original script: ${safeOriginalScript || '(not provided)'}`,
      `Context: ${safeContext || '(not provided)'}`
    ].join('\n'),
    temperature: 0.3,
    maxOutputTokens: 1024, // increased from 256: thinkingBudget=0 so no thinking token drain
    cacheConfig: {
      action: `rephrase-${safeAction}`,
      version: 'v1',
      ttl: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  });

  const parsed = parseJsonContent(aiText);
  const alternatives = Array.isArray(parsed?.alternatives)
    ? parsed.alternatives.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
    : [];

  if (alternatives.length === 0) {
    throw new Error('AI did not return alternatives');
  }

  return { alternatives };
};

export const rephraseSpeakingFragmentV2 = async ({
  selectedText,
  originalScript
}) => {
  const safeSelectedText = String(selectedText || '').trim();
  const safeOriginalScript = String(originalScript || '').trim();

  // 1. Mandatory Sanitizer / Validation Layer
  const defaultResponse = {
    simplify: [],
    shorten: [],
    rewrite: [],
    formalize: [],
    easier_to_pronounce: []
  };

  if (!safeSelectedText) {
    return defaultResponse;
  }

  try {
    // 2. Call Gemini API safely
    const aiText = await generateGeminiJson({
      systemInstruction: [
        'You are a speaking coach.',
        'Return ONLY JSON: {"simplify":[],"shorten":[],"rewrite":[],"formalize":[],"easier_to_pronounce":[]}.',
        'Provide 3 natural alternatives per key.'
      ].join(' '),
      userPrompt: [
        `Phrase: "${safeSelectedText}"`,
        `Context: "${safeOriginalScript || '(not provided)'}"`
      ].join('\n'),
      temperature: 0.3,
      maxOutputTokens: 2048, // increased: thinkingBudget=0 so all tokens go to output
      cacheConfig: {
        action: 'rephrase-v2',
        version: 'v1',
        ttl: 7 * 24 * 60 * 60 * 1000 // 7 days
      }
    });

    // 4. Try-catch protection for parsing
    let parsed;
    try {
      parsed = parseJsonContent(aiText);
    } catch (parseError) {
      console.error('[RephraseV2] JSON Parse Error:', parseError.message);
      return defaultResponse; // Never throw raw JSON crash to controller
    }

    if (!parsed || typeof parsed !== 'object') {
      console.error('[RephraseV2] AI returned non-object JSON');
      return defaultResponse;
    }

    // 5. JSON Sanitizer - Extract keys safely and auto-fill empty arrays if missing
    const extractArray = (key) => {
      if (Array.isArray(parsed[key])) {
        return parsed[key].map(item => String(item || '').trim()).filter(Boolean).slice(0, 3);
      }
      return [];
    };

    return {
      simplify: extractArray('simplify'),
      shorten: extractArray('shorten'),
      rewrite: extractArray('rewrite'),
      formalize: extractArray('formalize'),
      easier_to_pronounce: extractArray('easier_to_pronounce')
    };

  } catch (error) {
    // 6. Timeout / Network / 429 Safety
    console.error('[RephraseV2] Gemini API Request Failed:', error.message);
    return defaultResponse; // Fail gracefully, return empty arrays
  }
};

const PART_INSTRUCTIONS = {
  1: [
    'You are a VSTEP Speaking examiner writing a model answer for Part 1.',
    'PART 1 is Social Interaction. The candidate usually receives a main topic followed by 2 to 4 sub-questions.',
    'TARGET: CEFR B1-B2. Vietnamese university student.',
    'CRITICAL RULES:',
    '1. YOU MUST ANSWER EVERY SINGLE QUESTION in the prompt in the exact order they are asked. Do not skip any question.',
    '2. Address each question naturally, linking them together as one continuous spoken response.',
    '3. For each question, provide a direct answer followed by a brief reason or personal example.',
    'TONE & STYLE:',
    '- Sound like real spoken conversation, NOT an essay.',
    '- Use first-person ("I", "my", "me").',
    '- Use natural spoken connectors ("Well,", "Actually,", "To be honest,", "As for...").',
    '- Do NOT use academic linkers like "Furthermore" or "In conclusion".',
    'LENGTH: 80 - 150 words total (depending on the number of sub-questions).',
    'Return JSON: {"script": "..."}'
  ].join('\n'),
  2: [
    'You are a VSTEP Speaking examiner writing a model answer for Part 2.',
    'PART 2 is Solution Discussion — the candidate selects ONE option from 2–3 given choices and justifies it, while briefly acknowledging the other options.',
    'TARGET: CEFR B1-B2. Vietnamese university student.',
    'Similar to a strong VSTEP Speaking Part 2 response.',
    'YOU MUST FOLLOW THIS EXACT 4-PART STRUCTURE:',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '[SECTION 1 — Opening] (1–2 sentences)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '→ Naturally restate the situation and your chosen option.',
    '→ Pattern: "Well, thinking about [situation], I think the best option would be [your choice]."',
    '→ Tone: Natural, as if thinking aloud, not reading a script.',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '[SECTION 2 — Main Reasons] (60–80 words)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '→ Give 2 OR 3 reasons for your choice.',
    '→ EACH reason MUST follow this micro-pattern:',
    '   (a) State the reason clearly',
    '   (b) Explain WHY it matters',
    '   (c) Add a brief supporting detail or concrete example',
    '→ Connectors to use: "First of all,", "Also,", "Another reason is that,"',
    '→ Do NOT just list reasons without explanation.',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '[SECTION 3 — Discuss Other Options] (25–40 words)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '→ Briefly mention the other option(s).',
    '→ ACKNOWLEDGE their advantage(s) first.',
    '→ Then explain WHY they are less suitable for THIS specific situation.',
    '→ Do NOT just say they are bad or only list negatives. Be balanced.',
    '→ Pattern: "[Other option] does have [advantage], but in this case, [reason it is less ideal]..."',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '[SECTION 4 — Conclusion] (1–2 sentences)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '→ Reaffirm your choice with a brief summary of your core reason.',
    '→ Pattern: "So overall, I think [your choice] is the best option here because [core reason]."',
    'TOTAL LENGTH: 100–160 words. Keep each section concise.',
    'TONE: Think-aloud spoken delivery — deliberate but natural. NOT a formal essay.',
    'Do NOT use bullet points or numbered lists in the final script.',
    'Return JSON: {"script": "..."}'
  ].join('\n'),
  3: [
    'You are a VSTEP Speaking examiner writing a model answer for Part 3.',
    'PART 3 is Topic Development — an extended spoken monologue. The candidate discusses a topic, expresses a position, or analyzes a concept. This is NOT about choosing between given options (that is Part 2).',
    'TARGET: CEFR B1-B2. Vietnamese university student.',
    'Similar to a strong VSTEP Speaking Part 3 response.',
    'FOLLOW THIS RESPONSE STRUCTURE:',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '[Opening + Position] (2–3 sentences)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '→ State your general position or framing of the topic.',
    '→ Indicate what you will discuss (signpost).',
    '→ Pattern: "I think [topic] is [your position]. There are several reasons/aspects I\'d like to mention."',
    '→ Do NOT use "In this essay" or formal academic openers.',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '[Idea 1 — with Explanation + Example] (35–50 words)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '→ State your first main idea clearly.',
    '→ Explain the idea (why it is important, how it works).',
    '→ Support with a brief, concrete, real-world example.',
    '→ Signpost: "First of all,", "One important point is,"',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '[Idea 2 — with Explanation + Example] (35–50 words)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '→ State your second main idea.',
    '→ Explain and support with a concrete example.',
    '→ Signpost: "Moreover,", "Another key aspect is,"',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '[Counterargument — OPTIONAL] (15–25 words)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '→ Include ONLY if it strengthens your overall argument.',
    '→ Briefly acknowledge an opposing view, then refute or qualify it.',
    '→ Pattern: "Of course, some might argue that..., but I believe..."',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '[Conclusion] (1–2 sentences)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '→ Summarize your overall position.',
    '→ Pattern: "In conclusion, I believe...", "Overall, I think..."',
    'TOTAL LENGTH: 150–200 words.',
    'TONE: Organized but natural spoken monologue. Clear signposting, but NOT robotic.',
    'Do NOT use bullet points or numbered lists in the final script.',
    'Do NOT use overly academic vocabulary (avoid: "henceforth", "aforementioned", "it is evident that").',
    'Return JSON: {"script": "..."}'
  ].join('\n')
};

function detectVstepPart(part, questionText) {
  const num = Number(part);
  if (num === 1 || num === 2 || num === 3) return num;
  const q = String(questionText || '').toLowerCase();
  if (/part\s*1|social interaction|tương tác xã hội/i.test(q)) return 1;
  if (/part\s*3|topic development|phát triển chủ đề/i.test(q)) return 3;
  if (/part\s*2|solution discussion|thảo luận/i.test(q)) return 2;
  return 1;
}

export const generateVstepModelScript = async ({ question, part, forceRegenerate = false }) => {
  const safeQuestion = String(question || '').trim();
  if (!safeQuestion) throw new Error('question is required');

  const partNum = detectVstepPart(part, question);
  const maxTokens = partNum === 1 ? 1024 : 2048;

  const aiText = await generateGeminiJson({
    systemInstruction: PART_INSTRUCTIONS[partNum],
    userPrompt: `VSTEP Speaking Question: ${safeQuestion}\nGenerate the model answer now. Return JSON only.`,
    temperature: 0.55,
    maxOutputTokens: maxTokens,
    cacheConfig: {
      action: `vstep-script-part${partNum}`,
      version: 'v2.0', // Structure-driven prompt version
      ttl: 30 * 24 * 60 * 60 * 1000 // 30 days
    },
    forceRegenerate
  });

  const parsed = parseJsonContent(aiText);
  const script = String(parsed?.script || '').trim();
  if (!script) throw new Error('Gemini did not return a valid script');
  return { script };
};

export const generateSpeakingPracticeAssessment = async ({
  vstepQuestion,
  modelScript,
  finalTranscript,
  detectedErrors = [],
  omissionCount = 0,
  additionCount = 0,
  mispronunciationCount = 0
}) => {
  const safeQuestion = String(vstepQuestion || '').trim();
  const safeModelScript = String(modelScript || '').trim();
  const safeFinalTranscript = String(finalTranscript || '').trim();

  // Extract word-level error samples to keep payload compact.
  const safeErrors = Array.isArray(detectedErrors) ? detectedErrors : [];
  const omittedWords = safeErrors
    .filter(e => e.type === 'omission')
    .map(e => String(e.text || e.scriptToken || ''))
    .filter(Boolean)
    .slice(0, 15)
    .join(', ');
  const mispronWords = safeErrors
    .filter(e => e.type === 'mispronunciationCandidate')
    .map(e => `${String(e.scriptToken || e.text || '')}→${String(e.transcriptToken || '')}`)
    .filter(Boolean)
    .slice(0, 15)
    .join(', ');
  const addedWords = safeErrors
    .filter(e => e.type === 'addition')
    .map(e => String(e.text || ''))
    .filter(Boolean)
    .slice(0, 10)
    .join(', ');

  // ---------- System Instruction ----------
  // NOTE: Do NOT embed a JSON schema example here — it wastes ~150 input tokens and is redundant
  // because forceJsonOutput=true (responseMimeType=application/json) already constrains Gemini output.
  // Keep this instruction concise to leave more of the token budget for the actual JSON output.
  const systemInstruction = [
    'You are a VSTEP speaking examiner scoring a pronunciation and delivery practice task.',
    'Evaluate delivery (pronunciation, clarity, fluency, pace) only. Do not judge content.',
    'Scores 1-10 (10=best). Provide concise, constructive English feedback.',
    'Return ONLY JSON: {pronunciationScore, clarityScore, fluencyScore, volumeRating, paceRating, strengths, areasForImprovement, mispronouncedWords, missingWords, extraWords, overallFeedback, nextPracticeFocus}.',
    'mispronouncedWords format: {word, issue, suggestion}. Arrays max 5 items.'
  ].join(' ');

  // ---------- User Prompt ----------
  const userPrompt = [
    `Script: ${safeModelScript.substring(0, 350) || '(not provided)'}`,
    `Transcript: ${safeFinalTranscript.substring(0, 400) || '(not provided)'}`,
    `Context question: ${safeQuestion.substring(0, 150) || 'N/A'}`,
    `Omissions (${Number(omissionCount) || 0}): ${omittedWords || 'none'}`,
    `Additions (${Number(additionCount) || 0}): ${addedWords || 'none'}`,
    `Mispron candidates (${Number(mispronunciationCount) || 0}): ${mispronWords || 'none'}`
  ].join('\n');



  const aiText = await generateGeminiJson({
    systemInstruction,
    userPrompt,
    temperature: 0.25,
    // Root cause fix: 2048 was insufficient.
    // Gemini output for this schema (12 fields, arrays, subobjects) needs ~800-1500 tokens.
    // Using English feedback (not Vietnamese) already saves ~30-40% output tokens.
    // 4096 provides a safe headroom for any response length.
    maxOutputTokens: 8192, // increased from 4096: thinkingBudget=0, safe headroom for full schema
  });



  const parsed = parseJsonContent(aiText);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI did not return a valid JSON object for assessment');
  }

  const toStringArray = (val, limit = 5) =>
    Array.isArray(val) ? val.map(s => String(s || '').trim()).filter(Boolean).slice(0, limit) : [];

  const mispronouncedWords = Array.isArray(parsed?.mispronouncedWords)
    ? parsed.mispronouncedWords.slice(0, 10).map(item => ({
      word: String(item?.word || '').trim(),
      issue: String(item?.issue || '').trim(),
      suggestion: String(item?.suggestion || '').trim()
    }))
    : [];

  return {
    // New pronunciation-coach schema
    pronunciationScore: Number.isFinite(Number(parsed?.pronunciationScore)) ? Number(parsed.pronunciationScore) : 0,
    clarityScore: Number.isFinite(Number(parsed?.clarityScore)) ? Number(parsed.clarityScore) : 0,
    fluencyScore: Number.isFinite(Number(parsed?.fluencyScore)) ? Number(parsed.fluencyScore) : 0,
    volumeRating: String(parsed?.volumeRating || '').trim(),
    paceRating: String(parsed?.paceRating || '').trim(),
    strengths: toStringArray(parsed?.strengths, 5),
    areasForImprovement: toStringArray(parsed?.areasForImprovement, 5),
    mispronouncedWords,
    missingWords: toStringArray(parsed?.missingWords, 15),
    extraWords: toStringArray(parsed?.extraWords, 15),
    overallFeedback: String(parsed?.overallFeedback || '').trim(),
    nextPracticeFocus: String(parsed?.nextPracticeFocus || '').trim(),
    improvementSuggestions: toStringArray(parsed?.areasForImprovement, 5),
    overallAssessment: String(parsed?.overallFeedback || '').trim(),
    commonMistakes: mispronouncedWords.map(w => w.word).filter(Boolean).slice(0, 5),
    frequentlyMissedWords: toStringArray(parsed?.missingWords, 10),
    difficultVocabulary: toStringArray(parsed?.mispronouncedWords?.map?.(w => w.word), 10)
  };
};

// New: Transcribe audio using Gemini (simple fallback to frontend transcript)
export async function transcribeAudioWithAI(audioPath) {
  try {
    console.log('[transcribeAudioWithAI] Audio transcription not yet integrated', {
      audioPath
    });

    // Fallback: return empty, use frontend transcript
    return '';
  } catch (err) {
    console.error('[transcribeAudioWithAI] Transcription failed', {
      error: err.message
    });
    return '';
  }
}

export const explainReadingAnswers = async (passage, questions, forceRegenerate = false) => {
  if (!Array.isArray(questions) || questions.length === 0) return [];
  
  const CHUNK_SIZE = 5;
  const chunks = [];
  for (let i = 0; i < questions.length; i += CHUNK_SIZE) {
    chunks.push(questions.slice(i, i + CHUNK_SIZE));
  }

  const systemInstruction = [
    'You are an expert VSTEP Reading Teacher.',
    'I will provide a reading passage and a list of specific questions.',
    'For each question, provide a short, precise explanation.',
    'Return ONLY a JSON array of objects with this structure:',
    '[',
    '  {',
    '    "question_id": "id or index",',
    '    "correct_answer": "The exact option text",',
    '    "explanation": "Why this is correct based on the text (quote the clue briefly).",',
    '    "why_others_wrong": "Briefly explain why other tricky options are incorrect.",',
    '    "strategy_tip": "One short tip on how to locate the answer (e.g. Scanning for keywords)."',
    '  }',
    ']',
    'Keep explanations concise, easy to understand for B1-B2 students. No grammar jargon unless necessary.'
  ].join('\n');

  const promises = chunks.map(async (chunk) => {
    const userPrompt = `Passage:\n${String(passage || '').trim()}\n\nQuestions:\n${JSON.stringify(chunk, null, 2)}`;
    
    const cacheConfig = {
      action: 'explain-reading-chunk',
      version: 'v1.0-reading-explanation',
      input: `${String(passage || '').trim()}_${JSON.stringify(chunk)}`,
      ttl: 30 * 24 * 60 * 60 * 1000 // 30 days
    };

    try {
      const resultStr = await generateGeminiJson({
        systemInstruction,
        userPrompt,
        temperature: 0.2,
        maxOutputTokens: 2048,
        cacheConfig,
        forceRegenerate
      });
      
      const parsed = parseJsonContent(resultStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('[explainReadingAnswers] Failed to explain chunk:', err.message);
      return [];
    }
  });

  const results = await Promise.all(promises);
  return results.flat();
};
