import fs from 'fs';
import { fetchWithTimeoutRetryCircuit } from './aiWrapper.js';

const RAW_API_KEYS = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
const GEMINI_API_KEY_LIST = RAW_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);


const GEMINI_MODEL_TEXT = 'gemini-2.5-flash';

const getGeminiListModelsEndpoint = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;

const getMaskedKey = (key) => {
  if (!key) return '(missing)';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
};

function ensureGeminiConfigured() {
  if (GEMINI_API_KEY_LIST.length === 0) {
    throw new Error('Gemini API keys are missing. Set GEMINI_API_KEYS (comma-separated) or GEMINI_API_KEY in .env');
  }
}

export async function generateGeminiText({ systemInstruction, userPrompt, userParts = [], temperature = 0.6, maxOutputTokens = 1024, forceJsonOutput = false }) {
  ensureGeminiConfigured();

  const currentKey = GEMINI_API_KEY_LIST[0];
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
      maxOutputTokens
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
    retries: 1,  // 1 retry on transient errors (network/timeout)
    apiKey: currentKey
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



  return output;
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
export async function generateGeminiJson({ systemInstruction, userPrompt, userParts = [], temperature = 0.6, maxOutputTokens = 1024 }) {
  ensureGeminiConfigured();

  const currentKey = GEMINI_API_KEY_LIST[0];
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
      responseMimeType: 'application/json'  // always JSON for this service
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
    timeoutMs: 28000,
    retries: 1,
    apiKey: currentKey
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

  return output;
}

export const generateExplanation = async (concept, language) => {
  try {
    return await generateGeminiText({
      systemInstruction: `You are a language learning assistant. Explain concepts clearly in ${language}.`,
      userPrompt: `Explain this concept: ${concept}`,
      temperature: 0.7,
      maxOutputTokens: 700
    });
  } catch (error) {
    throw new Error('Failed to generate explanation: ' + error.message);
  }
};

export const generateExercises = async (difficulty, count = 5) => {
  try {
    const safeCount = Number.isFinite(Number(count)) ? Math.min(Math.max(Number(count), 1), 20) : 5;
    const aiText = await generateGeminiJson({
      systemInstruction: 'Return strict JSON only.',
      userPrompt: `Generate ${safeCount} exercises for difficulty ${difficulty}. Return JSON array only. Each item must include question, options, correctAnswer, explanation.`,
      temperature: 0.6,
      maxOutputTokens: 1400
    });

    return parseExerciseJson(aiText);
  } catch (error) {
    throw new Error('Failed to generate exercises: ' + error.message);
  }
};

export const generateExercisesForCourseSkill = async ({ skill, cefrLevel, count = 5, topic, audioInput }) => {
  const safeSkill = String(skill || '').trim().toLowerCase();
  const safeLevel = String(cefrLevel || '').trim().toUpperCase();
  const safeCount = Number.isFinite(Number(count)) ? Math.min(Math.max(Number(count), 1), 20) : 5;
  const optionalTopic = topic ? String(topic).trim() : '';

  const skillGuide = {
    reading: 'For reading: produce readingPassage and multiple-choice comprehension questions.',
    listening: 'For listening: use provided audio context, set taskPrompt for listening instructions, and create multiple-choice listening questions.',
    writing: 'For writing: create taskPrompt only (writing prompt), questions should be [].',
    speaking: 'For speaking: create taskPrompt only (speaking prompt), questions should be [].'
  };

  const userParts = [];
  if (safeSkill === 'listening' && audioInput?.base64 && audioInput?.mimeType) {
    userParts.push({
      inlineData: {
        mimeType: audioInput.mimeType,
        data: audioInput.base64
      }
    });
  }

  let aiText = '';
  try {
    const maxAttempts = 3;
    let parsedSet = null;
    let lastErr = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const isRetry = attempt > 1;
      const retryCount = isRetry && (safeSkill === 'reading' || safeSkill === 'listening')
        ? Math.max(3, Math.min(safeCount, 6))
        : safeCount;

      aiText = await generateGeminiJson({
        systemInstruction: 'Return strict JSON only. Provide keys: readingPassage, taskPrompt, sampleAnswer, questions.',
        userPrompt: `Create an exercise set. Skill: ${safeSkill}. CEFR: ${safeLevel}. Question count target: ${retryCount}. Topic: ${optionalTopic || 'general'}. Return a compact JSON object only.`,
        userParts,
        temperature: isRetry ? 0.3 : 0.5,
        maxOutputTokens: 4096
      });

      console.log('[generateExercisesForCourseSkill] AI response received', {
        attempt,
        skill: safeSkill,
        cefrLevel: safeLevel,
        aiTextLength: aiText?.length,
        aiTextPreview: aiText?.substring(0, 200)
      });

      try {
        parsedSet = parseExerciseSetJson(aiText);
        break;
      } catch (err) {
        lastErr = err;
        console.warn('[generateExercisesForCourseSkill] Parse failed, will retry if attempts remain', {
          attempt,
          maxAttempts,
          skill: safeSkill,
          cefrLevel: safeLevel,
          error: err?.message
        });
      }
    }

    if (!parsedSet) {
      throw lastErr || new Error('AI did not return valid JSON');
    }

    console.log('[generateExercisesForCourseSkill] Exercise parsed successfully', {
      skill: safeSkill,
      cefrLevel: safeLevel,
      questionCount: parsedSet.questions?.length || 0
    });

    return {
      skill: safeSkill,
      cefrLevel: safeLevel,
      topic: optionalTopic,
      readingPassage: parsedSet.readingPassage,
      taskPrompt: parsedSet.taskPrompt,
      sampleAnswer: parsedSet.sampleAnswer,
      questions: parsedSet.questions
    };
  } catch (error) {
    console.error('[generateExercisesForCourseSkill] Exercise generation failed', {
      skill: safeSkill,
      cefrLevel: safeLevel,
      count: safeCount,
      topic: optionalTopic,
      hasAudioInput: !!audioInput,
      aiTextLength: aiText.length,
      aiTextPreview: aiText ? aiText.substring(0, 400) : '(empty)',
      errorMessage: error?.message,
      errorStack: error?.stack
    });
    throw new Error('Failed to generate course exercises: ' + error.message);
  }
};

export const refineExerciseSet = async ({ skill, cefrLevel, feedback, currentExercise }) => {
  const safeSkill = String(skill || '').trim().toLowerCase();
  const safeLevel = String(cefrLevel || '').trim().toUpperCase();
  const safeFeedback = String(feedback || '').trim();

  if (!safeFeedback) {
    throw new Error('Feedback is required to refine exercise');
  }
  const compactCurrent = {
    title: String(currentExercise?.title || '').trim(),
    skill: safeSkill,
    cefrLevel: safeLevel,
    topic: String(currentExercise?.topic || '').trim(),
    readingPassage: String(currentExercise?.readingPassage || '').slice(0, 1600),
    taskPrompt: String(currentExercise?.taskPrompt || '').slice(0, 600),
    sampleAnswer: String(currentExercise?.sampleAnswer || '').slice(0, 600),
    questions: Array.isArray(currentExercise?.questions)
      ? currentExercise.questions.slice(0, 6).map((q) => ({
        question: String(q?.question || ''),
        options: Array.isArray(q?.options) ? q.options.slice(0, 4).map((o) => String(o || '')) : [],
        correctAnswer: String(q?.correctAnswer || ''),
        explanation: String(q?.explanation || '').slice(0, 160)
      }))
      : []
  };

  let aiText = '';
  let parsedSet = null;
  let lastErr = null;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const isRetry = attempt > 1;
    aiText = await generateGeminiJson({
      systemInstruction: 'Return strict JSON only with keys: readingPassage, taskPrompt, sampleAnswer, questions.',
      userPrompt: `Revise exercise JSON per teacher feedback. Skill: ${safeSkill}. CEFR: ${safeLevel}. Feedback: ${safeFeedback}. Return compact JSON object only.`,
      temperature: isRetry ? 0.25 : 0.4,
      maxOutputTokens: 4096
    });

    try {
      parsedSet = parseExerciseSetJson(aiText);
      break;
    } catch (err) {
      lastErr = err;
      console.warn('[refineExerciseSet] Parse failed, retrying if possible', {
        attempt,
        maxAttempts,
        skill: safeSkill,
        cefrLevel: safeLevel,
        aiTextLength: aiText.length,
        error: err?.message
      });
    }
  }

  if (!parsedSet) {
    console.warn('[refineExerciseSet] Main refine failed after retries, trying compact patch fallback', {
      skill: safeSkill,
      cefrLevel: safeLevel,
      feedbackPreview: safeFeedback.substring(0, 200),
      aiTextLength: aiText.length,
      aiTextPreview: aiText ? aiText.substring(0, 400) : '(empty)',
      error: lastErr?.message
    });

    // Fallback: ask AI for a compact patch JSON (changed fields only), then merge.
    let patchText = '';
    let patchObj = null;
    for (let patchAttempt = 1; patchAttempt <= 2; patchAttempt += 1) {
      patchText = await generateGeminiJson({
        systemInstruction: 'Return a compact JSON object patch only. Allowed keys: readingPassage, taskPrompt, sampleAnswer, questions.',
        userPrompt: `Skill: ${safeSkill}. CEFR: ${safeLevel}. Feedback: ${safeFeedback}. Current questions length: ${compactCurrent.questions.length}. Return JSON patch only.`,
        temperature: 0.2,
        maxOutputTokens: 1800
      });

      try {
        patchObj = parseJsonContent(patchText);
        if (patchObj && typeof patchObj === 'object' && !Array.isArray(patchObj)) {
          break;
        }
      } catch (patchErr) {
        console.warn('[refineExerciseSet] Compact patch parse failed', {
          patchAttempt,
          error: patchErr?.message,
          patchTextLength: patchText.length,
          patchTextPreview: patchText.substring(0, 300)
        });
      }
    }

    if (!patchObj || typeof patchObj !== 'object' || Array.isArray(patchObj)) {
      console.error('[refineExerciseSet] Compact patch fallback also failed', {
        skill: safeSkill,
        cefrLevel: safeLevel,
        patchTextLength: patchText.length,
        patchTextPreview: patchText ? patchText.substring(0, 400) : '(empty)',
        lastError: lastErr?.message
      });
      throw lastErr || new Error('AI did not return valid JSON');
    }

    const merged = {
      readingPassage: patchObj.readingPassage ?? compactCurrent.readingPassage,
      taskPrompt: patchObj.taskPrompt ?? compactCurrent.taskPrompt,
      sampleAnswer: patchObj.sampleAnswer ?? compactCurrent.sampleAnswer,
      questions: Array.isArray(patchObj.questions) ? patchObj.questions : compactCurrent.questions
    };

    parsedSet = parseExerciseSetJson(JSON.stringify(merged));
  }

  return {
    readingPassage: parsedSet.readingPassage,
    taskPrompt: parsedSet.taskPrompt,
    sampleAnswer: parsedSet.sampleAnswer,
    questions: parsedSet.questions
  };
};

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

function parseExerciseJson(rawContent) {
  const content = String(rawContent || '').trim();

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/```json\s*([\s\S]*?)\s*```/i) || content.match(/```\s*([\s\S]*?)\s*```/i);
    if (!match) {
      throw new Error('AI did not return valid JSON');
    }
    parsed = JSON.parse(match[1]);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('AI response must be a JSON array');
  }

  return parsed.map((item) => ({
    question: normalizeGeneratedText(item?.question),
    options: Array.isArray(item?.options) ? item.options.map((opt) => normalizeGeneratedText(opt)).filter(Boolean) : [],
    correctAnswer: normalizeGeneratedText(item?.correctAnswer),
    explanation: normalizeGeneratedText(item?.explanation)
  }));
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

function parseExerciseSetJson(rawContent) {
  let parsed;
  try {
    parsed = parseJsonContent(rawContent);
  } catch (parseErr) {
    console.error('[parseExerciseSetJson] parseJsonContent failed', {
      error: parseErr?.message,
      rawContentLength: String(rawContent || '').length
    });
    throw parseErr;
  }

  // Normalize common wrapper shapes from LLM outputs.
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    if (parsed.data && typeof parsed.data === 'object') parsed = parsed.data;
    if (parsed.result && typeof parsed.result === 'object') parsed = parsed.result;
    if (parsed.exercise && typeof parsed.exercise === 'object') parsed = parsed.exercise;
  }

  // If model returns only questions array, coerce to expected object shape.
  if (Array.isArray(parsed)) {
    parsed = {
      readingPassage: '',
      taskPrompt: '',
      sampleAnswer: '',
      questions: parsed
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error('[parseExerciseSetJson] Parsed JSON is not an object', {
      type: Array.isArray(parsed) ? 'array' : typeof parsed,
      keys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 10) : 'N/A',
      sample: JSON.stringify(parsed).substring(0, 200)
    });
    throw new Error('AI response must be a JSON object for exercise set');
  }

  if (!Array.isArray(parsed.questions)) {
    console.error('[parseExerciseSetJson] questions field is not an array', {
      questionsType: typeof parsed.questions,
      questionsValue: String(parsed.questions).substring(0, 200)
    });
    throw new Error('AI response must include questions array');
  }

  const questions = parsed.questions.map((item, idx) => {
    const options = Array.isArray(item?.options) ? item.options.map((opt) => normalizeGeneratedText(opt)).filter(Boolean) : [];

    // For reading/listening exercises, enforce 2+ options
    // For writing/speaking, questions array may be empty, so skip this check
    if (options.length > 0 && options.length < 2) {
      throw new Error(`Question ${idx + 1} must have at least 2 options (has ${options.length})`);
    }

    const correctAnswer = normalizeGeneratedText(item?.correctAnswer);
    let normalizedCorrect = correctAnswer;

    // Only try to match correctAnswer with options if options exist
    if (options.length > 0) {
      normalizedCorrect = options.find((opt) => opt.toLowerCase() === correctAnswer.toLowerCase()) || correctAnswer;
    }

    return {
      question: normalizeGeneratedText(item?.question),
      options,
      correctAnswer: normalizedCorrect,
      explanation: normalizeGeneratedText(item?.explanation)
    };
  });

  return {
    readingPassage: normalizeGeneratedText(parsed.readingPassage),
    taskPrompt: normalizeGeneratedText(parsed.taskPrompt),
    sampleAnswer: normalizeGeneratedText(parsed.sampleAnswer),
    questions
  };
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
      maxOutputTokens: 768
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
        maxOutputTokens: 768
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
      'You are a speaking coach for English learners.',
      'Return strict JSON only with key alternatives.',
      'alternatives must be an array of 3 short strings.',
      'Each alternative must be easier to speak, easier to remember, grammatically correct, and natural sounding.',
      'Do not add explanations.'
    ].join(' '),
    userPrompt: [
      `Action: ${guide}`,
      `Selected phrase: ${safeSelectedText}`,
      `Original script: ${safeOriginalScript || '(not provided)'}`,
      `Nearby context: ${safeContext || '(not provided)'}`,
      'Return JSON like {"alternatives":["...","...","..."]} only.'
    ].join('\n'),
    temperature: 0.3,
    maxOutputTokens: 256
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

export const generateVstepModelScript = async ({ question, part = 1 }) => {
  const safeQuestion = String(question || '').trim();
  if (!safeQuestion) throw new Error('question is required');

  let lengthInstruction = '';
  let maxTokens = 512;

  switch (Number(part)) {
    case 1:
      lengthInstruction = 'Length: 40-80 words. Give a direct, concise answer.';
      maxTokens = 1024;
      break;
    case 2:
      lengthInstruction = 'Length: 80-150 words. Discuss the options and justify your choice.';
      maxTokens = 2048;
      break;
    case 3:
      lengthInstruction = 'Length: 120-200 words. Develop the topic thoroughly with examples.';
      maxTokens = 2048;
      break;
    default:
      lengthInstruction = 'Length: 80-150 words.';
      maxTokens = 2048;
  }

  const aiText = await generateGeminiJson({
    systemInstruction: [
      'You are an experienced VSTEP Speaking instructor.',
      `Generate a model answer for a VSTEP Speaking Part ${part} practice question.`,
      'Requirements:',
      '- CEFR level B1-B2.',
      '- Suitable for Vietnamese university students.',
      '- Natural spoken English.',
      '- Similar to a strong VSTEP Speaking response.',
      '- Use simple but effective vocabulary.',
      '- Use clear sentence structures.',
      '- Include:',
      '  1. Direct answer',
      '  2. Supporting reasons',
      '  3. Examples when appropriate',
      '  4. Brief conclusion',
      'The answer should sound natural when spoken aloud.',
      'Avoid:',
      '- Academic writing style',
      '- Complex vocabulary',
      '- Overly long sentences',
      '- Native-level idioms',
      lengthInstruction,
      'Return JSON:',
      '{',
      '  "script": "...",',
      '  "keyVocabulary": [],',
      '  "difficulty": "B1/B2"',
      '}'
    ].join('\n'),
    userPrompt: [
      `VSTEP Speaking Question: ${safeQuestion}`,
      'Generate the model answer now. Return JSON only.'
    ].join('\n'),
    temperature: 0.55,
    maxOutputTokens: maxTokens
  });

  const parsed = parseJsonContent(aiText);
  const script = String(parsed?.script || '').trim();
  if (!script) throw new Error('Gemini did not return a valid script');
  return { script, keyVocabulary: parsed?.keyVocabulary || [], difficulty: parsed?.difficulty || 'B1/B2' };
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
    'You are an English pronunciation coach evaluating a learner who is reading a script aloud.',
    'Evaluate delivery quality only (pronunciation, clarity, fluency, pace, intonation).',
    'Do NOT judge content, ideas, or task achievement.',
    'Scoring (1-10): pronunciationScore: 9-10=native-like, 7-8=minor mistakes, 5-6=understandable, 3-4=frequent errors, 1-2=hard to understand.',
    'clarityScore: 9-10=very clear, 5-6=sometimes unclear, 1-2=very difficult.',
    'fluencyScore: 9-10=smooth, 5-6=noticeable hesitations, 1-2=fragmented.',
    'volumeRating: "too quiet" | "acceptable" | "too loud".',
    'paceRating: "too slow" | "appropriate" | "too fast".',
    'Provide short, constructive, encouraging feedback in English.',
    'Return ONLY valid compact JSON with these exact keys: pronunciationScore, clarityScore, fluencyScore, volumeRating, paceRating, strengths, areasForImprovement, mispronouncedWords, missingWords, extraWords, overallFeedback, nextPracticeFocus.',
    'strengths and areasForImprovement: max 3 short items each.',
    'mispronouncedWords: max 5 items, each with word, issue, suggestion.',
    'missingWords and extraWords: plain string arrays, max 10 items each.',
    'overallFeedback and nextPracticeFocus: 1-2 sentences each. Be concise.'
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
    maxOutputTokens: 4096,
    
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


