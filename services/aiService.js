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

async function generateGeminiText({ systemInstruction, userPrompt, temperature = 0.6, maxOutputTokens = 1024 }) {
  ensureGeminiConfigured();

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_TEXT}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const safeEndpoint = endpoint.replace(encodeURIComponent(GEMINI_API_KEY), '***MASKED***');
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {
      temperature,
      maxOutputTokens
    }
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok) {
    const apiMessage = data?.error?.message || `Gemini request failed with status ${response.status}`;
    console.error('[Gemini] generateContent failed', {
      model: GEMINI_MODEL_TEXT,
      status: response.status,
      endpoint: safeEndpoint,
      key: getMaskedKey(),
      error: data?.error || data
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
    throw new Error('Gemini returned empty content');
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

export const generateExercisesForCourseSkill = async ({ skill, cefrLevel, count = 5, topic }) => {
  const safeSkill = String(skill || '').trim().toLowerCase();
  const safeLevel = String(cefrLevel || '').trim().toUpperCase();
  const safeCount = Number.isFinite(Number(count)) ? Math.min(Math.max(Number(count), 1), 20) : 5;
  const optionalTopic = topic ? String(topic).trim() : '';

  try {
    const aiText = await generateGeminiText({
      systemInstruction: [
        'You are an expert English teacher.',
        'Generate a complete exercise set by CEFR level and language skill.',
        'Return strict JSON only, no markdown, no extra text.',
        'Output must be a JSON object with keys: readingPassage (string), questions (array).',
        'Each question must have keys: question (string), options (string[4]), correctAnswer (string), explanation (string).',
        'correctAnswer must be one of the exact option texts.',
        'For reading skill, readingPassage is required and should be meaningful for the level.',
        'For other skills, readingPassage should be an empty string.',
        'The grammar, vocabulary, and complexity must match the CEFR level exactly.'
      ].join(' '),
      userPrompt: [
        `Create an English exercise set with ${safeCount} questions.`,
        `Skill: ${safeSkill}.`,
        `CEFR Level: ${safeLevel}.`,
        optionalTopic ? `Focus topic: ${optionalTopic}.` : 'Use a practical daily-life/business mix suitable for this level.',
        'Questions must be in English.',
        'Explanations can be concise and Vietnamese-friendly.',
        'Return JSON object only.'
      ].join(' '),
      temperature: 0.5,
      maxOutputTokens: 2600
    });

    const parsedSet = parseExerciseSetJson(aiText);
    return {
      skill: safeSkill,
      cefrLevel: safeLevel,
      topic: optionalTopic,
      readingPassage: parsedSet.readingPassage,
      questions: parsedSet.questions
    };
  } catch (error) {
    throw new Error('Failed to generate course exercises: ' + error.message);
  }
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
    question: String(item?.question || '').trim(),
    options: Array.isArray(item?.options) ? item.options.map((opt) => String(opt)) : [],
    correctAnswer: String(item?.correctAnswer || '').trim(),
    explanation: String(item?.explanation || '').trim()
  }));
}

function parseJsonContent(rawContent) {
  const content = String(rawContent || '').trim();

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/```json\s*([\s\S]*?)\s*```/i) || content.match(/```\s*([\s\S]*?)\s*```/i);
    if (!match) {
      throw new Error('AI did not return valid JSON');
    }
    return JSON.parse(match[1]);
  }
}

function parseExerciseSetJson(rawContent) {
  const parsed = parseJsonContent(rawContent);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI response must be a JSON object for exercise set');
  }

  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error('AI response must include a non-empty questions array');
  }

  const questions = parsed.questions.map((item) => {
    const options = Array.isArray(item?.options) ? item.options.map((opt) => String(opt || '').trim()).filter(Boolean) : [];
    if (options.length < 2) {
      throw new Error('Each question must have at least 2 options');
    }

    const correctAnswer = String(item?.correctAnswer || '').trim();
    const normalizedCorrect = options.find((opt) => opt.toLowerCase() === correctAnswer.toLowerCase()) || correctAnswer;

    return {
      question: String(item?.question || '').trim(),
      options,
      correctAnswer: normalizedCorrect,
      explanation: String(item?.explanation || '').trim()
    };
  });

  return {
    readingPassage: String(parsed.readingPassage || '').trim(),
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
