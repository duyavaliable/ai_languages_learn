import OpenAI from 'openai';

let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

export const generateExplanation = async (concept, language) => {
  if (!openai) throw new Error('AI service is not available');
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{
        role: "system",
        content: `You are a language learning assistant. Explain concepts clearly in ${language}.`
      }, {
        role: "user",
        content: `Explain this concept: ${concept}`
      }],
      temperature: 0.7,
      max_tokens: 500
    });

    return response.choices[0].message.content;
  } catch (error) {
    throw new Error('Failed to generate explanation: ' + error.message);
  }
};

export const generateExercises = async (topic, difficulty, count = 5) => {
  if (!openai) throw new Error('AI service is not available');
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{
        role: "system",
        content: "You are a language learning exercise generator. Create engaging exercises with clear questions and answers."
      }, {
        role: "user",
        content: `Generate ${count} ${difficulty} level exercises about ${topic}. Return as JSON array with fields: question, options (array of 4), correctAnswer, explanation.`
      }],
      temperature: 0.8,
      max_tokens: 1000
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    throw new Error('Failed to generate exercises: ' + error.message);
  }
};

export const checkPronunciation = async (audioData, text, language) => {
  if (!openai) throw new Error('AI service is not available');
  try {
    // Note: This is a simplified version. Real implementation would use speech-to-text API
    const response = await openai.audio.transcriptions.create({
      file: audioData,
      model: "whisper-1",
      language: language
    });

    const transcription = response.text;
    const accuracy = calculateSimilarity(transcription.toLowerCase(), text.toLowerCase());

    return {
      transcription,
      accuracy,
      feedback: accuracy > 0.8 ? 'Excellent pronunciation!' : 'Keep practicing!'
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
