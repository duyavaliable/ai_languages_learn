// Option 1 (the way you requested): paste Gemini API key directly here.
// Example: const HARDCODED_GEMINI_API_KEY = 'AIzaSy...';
const HARDCODED_GEMINI_API_KEY = '';

// Option 2: keep key in .env (recommended for security).
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL_TEXT = 'gemini-2.5-flash';

const getGeminiListModelsEndpoint = () =>
  `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_API_KEY)}`;

const getMaskedKey = () => {
  if (!GEMINI_API_KEY) return '(missing)';
  if (GEMINI_API_KEY.length <= 8) return '****';
  return `${GEMINI_API_KEY.slice(0, 4)}...${GEMINI_API_KEY.slice(-4)}`;
};

function ensureGeminiConfigured() {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is missing. Set HARDCODED_GEMINI_API_KEY in services/aiService.js or GEMINI_API_KEY in .env');
  }
}

async function generateGeminiText({ systemInstruction, userPrompt, userParts = [], temperature = 0.6, maxOutputTokens = 1024, forceJsonOutput = false }) {
  ensureGeminiConfigured();

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_TEXT}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const safeEndpoint = endpoint.replace(encodeURIComponent(GEMINI_API_KEY), '***MASKED***');
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
    body.generationConfig.response_mime_type = 'application/json';
  }

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  console.log('[Gemini] Sending request', {
    model: GEMINI_MODEL_TEXT,
    endpoint: safeEndpoint,
    forceJsonOutput,
    hasAudioPart: userParts.some(p => p.inlineData),
    bodySize: JSON.stringify(body).length,
    temperature,
    maxOutputTokens
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  console.log('[Gemini] Raw response received', {
    status: response.status,
    ok: response.ok,
    dataKeys: Object.keys(data || {}),
    hasError: !!data?.error,
    hasCandidates: !!data?.candidates,
    candidatesLength: data?.candidates?.length,
    firstCandidateKeys: data?.candidates?.[0] ? Object.keys(data.candidates[0]) : null,
    finishReason: data?.candidates?.[0]?.finishReason || null
  });

  if (data?.candidates?.[0]?.finishReason && String(data.candidates[0].finishReason).toUpperCase().includes('MAX_TOKENS')) {
    console.warn('[Gemini] Output may be truncated due to token limit', {
      finishReason: data.candidates[0].finishReason,
      model: GEMINI_MODEL_TEXT,
      maxOutputTokens
    });
  }

  if (!response.ok) {
    const apiMessage = data?.error?.message || `Gemini request failed with status ${response.status}`;
    console.error('[Gemini] generateContent failed', {
      model: GEMINI_MODEL_TEXT,
      status: response.status,
      endpoint: safeEndpoint,
      key: getMaskedKey(),
      error: data?.error || data,
      fullData: JSON.stringify(data).substring(0, 500)
    });

    let availableModels = [];
    try {
      const listResponse = await fetch(getGeminiListModelsEndpoint(), { method: 'GET' });
      const listData = await listResponse.json();
      availableModels = (listData?.models || [])
        .map((m) => String(m?.name || '').replace('models/', ''))
        .filter(Boolean)
        .slice(0, 25);

      console.error('[Gemini] listModels result (first 25)', {
        status: listResponse.status,
        models: availableModels
      });
    } catch (listErr) {
      console.error('[Gemini] listModels failed', {
        message: listErr?.message || String(listErr)
      });
    }

    const hint = availableModels.length
      ? ` Available models (sample): ${availableModels.join(', ')}`
      : ' Could not fetch available models automatically.';

    throw new Error(`${apiMessage} [current model: ${GEMINI_MODEL_TEXT}]${hint}`);
  }

  const output = (data?.candidates || [])
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text || '')
    .join('')
    .trim();

  if (!output) {
    console.error('[Gemini] Empty output extracted from response', {
      candidatesCount: data?.candidates?.length,
      firstCandidateContent: data?.candidates?.[0]?.content,
      firstCandidateParts: data?.candidates?.[0]?.content?.parts
    });
    throw new Error('Gemini returned empty content');
  }

  console.log('[Gemini] Output extracted successfully', {
    outputLength: output.length,
    outputPreview: output.substring(0, 300),
    outputEnd: output.length > 300 ? output.substring(output.length - 200) : ''
  });

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

export const generateExercises = async (topic, difficulty, count = 5) => {
  try {
    const safeCount = Number.isFinite(Number(count)) ? Math.min(Math.max(Number(count), 1), 20) : 5;
    const aiText = await generateGeminiText({
      systemInstruction: 'You are an English exercise generator. Return strict JSON only.',
      userPrompt: `Generate ${safeCount} ${difficulty} level English exercises about "${topic || 'general English'}". Return JSON array only. Each item must have: question, options (array, can be empty for speaking/writing), correctAnswer, explanation.`,
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

      aiText = await generateGeminiText({
        systemInstruction: [
          'You are an expert English teacher.',
          'Generate a complete exercise set by CEFR level and language skill for an LMS.',
          'Return strict JSON only, no markdown, no extra text.',
          'Output must be a JSON object with keys: readingPassage (string), taskPrompt (string), sampleAnswer (string), questions (array).',
          'Each question must have keys: question (string), options (string[]), correctAnswer (string), explanation (string).',
          'For multiple-choice questions, create 4 options and correctAnswer must match one option exactly.',
          'For writing and speaking, questions may be [] and sampleAnswer must be filled.',
          'For reading, taskPrompt should be empty and readingPassage should be meaningful.',
          'For listening, readingPassage should be empty and taskPrompt should describe listening task in English.',
          'The grammar, vocabulary, and complexity must match the CEFR level exactly.',
          'Keep JSON compact and valid. Do not end output with dangling comma.',
          'For reading/listening: keep passage concise (about 180-260 words) and explanations short (<= 20 words).'
        ].join(' '),
        userPrompt: [
          `Create an English exercise set.`,
          `Skill: ${safeSkill}.`,
          `CEFR Level: ${safeLevel}.`,
          safeSkill === 'reading' || safeSkill === 'listening'
            ? `Question count target: ${retryCount}.`
            : 'Question count target: 0 (task-based response).',
          optionalTopic ? `Focus topic: ${optionalTopic}.` : 'Use a practical daily-life/business mix suitable for this level.',
          skillGuide[safeSkill] || '',
          safeSkill === 'listening' && audioInput ? 'The audio file is provided in the message. Base questions on that audio content.' : '',
          'Questions and prompts must be in English.',
          'Explanations can be concise and Vietnamese-friendly.',
          isRetry ? 'Previous response was invalid/truncated JSON. Return a shorter but complete valid JSON object now.' : '',
          'Return JSON object only.'
        ].join(' '),
        userParts,
        temperature: isRetry ? 0.3 : 0.5,
        maxOutputTokens: 4096,
        forceJsonOutput: true
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
    aiText = await generateGeminiText({
      systemInstruction: [
        'You are an English assessment editor.',
        'Revise the exercise according to teacher feedback while keeping the same CEFR level and skill.',
        'Return strict JSON only with the same structure:',
        'readingPassage, taskPrompt, sampleAnswer, questions.',
        'Do not add markdown or extra commentary.',
        'Keep output compact and valid JSON. Do not end with dangling commas.'
      ].join(' '),
      userPrompt: [
        `Skill: ${safeSkill}.`,
        `CEFR Level: ${safeLevel}.`,
        `Teacher feedback: ${safeFeedback}.`,
        `Current exercise JSON: ${JSON.stringify(compactCurrent)}`,
        isRetry ? 'Previous output was invalid/truncated JSON. Return a shorter but complete valid JSON object now.' : '',
        'Revise the exercise to match the feedback.'
      ].join(' '),
      temperature: isRetry ? 0.25 : 0.4,
      maxOutputTokens: 4096,
      forceJsonOutput: true
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
      patchText = await generateGeminiText({
        systemInstruction: [
          'You revise exercises by returning compact JSON patch only.',
          'Return strict JSON object only, no markdown.',
          'Allowed keys: readingPassage, taskPrompt, sampleAnswer, questions.',
          'Include only fields that need changes based on feedback.',
          'Keep output short and valid JSON.'
        ].join(' '),
        userPrompt: [
          `Skill: ${safeSkill}.`,
          `CEFR Level: ${safeLevel}.`,
          `Feedback: ${safeFeedback}.`,
          `Current readingPassage: ${compactCurrent.readingPassage}`,
          `Current taskPrompt: ${compactCurrent.taskPrompt}`,
          `Current sampleAnswer: ${compactCurrent.sampleAnswer}`,
          `Current questions: ${JSON.stringify(compactCurrent.questions).slice(0, 2400)}`,
          'If feedback asks to make reading longer, return only readingPassage.',
          'Return JSON object patch only.'
        ].join(' '),
        temperature: 0.2,
        maxOutputTokens: 1800,
        forceJsonOutput: true
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
      const parsed = JSON.parse(candidate);
      console.log(`[parseJsonContent] ✅ Parsed from ${source}`);
      return parsed;
    } catch (err) {
      console.log(`[parseJsonContent] ${source} parse failed:`, err.message);
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

  console.log('[parseJsonContent] Attempting to parse', {
    contentLength: content.length,
    contentPreview: content.substring(0, 300),
    contentEnd: content.length > 300 ? content.substring(content.length - 300) : '',
    firstChar: content.charCodeAt(0),
    lastChar: content.charCodeAt(content.length - 1),
    isJsonStart: content.startsWith('{') || content.startsWith('['),
    hasJsonStructure: /[\{\[][\s\S]*[\}\]]/i.test(content)
  });

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
      console.log('[parseJsonContent] Found markdown block attempt', {
        attempt: i + 1,
        extractedLength: extracted.length,
        extractedPreview: extracted.substring(0, 200)
      });
      
      const parsedMarkdown = tryParse(extracted, `markdown-block-${i + 1}`);
      if (parsedMarkdown !== null) return parsedMarkdown;
    }
  }

  // Balanced extraction handles extra text before/after JSON safely.
  const balanced = extractBalancedJson(content);
  if (balanced) {
    console.log('[parseJsonContent] Attempting balanced JSON extraction', {
      extractedLength: balanced.length,
      preview: balanced.substring(0, 200)
    });
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
