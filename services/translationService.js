import axios from 'axios';

export const translateText = async (text, fromLang, toLang) => {
  try {
    // Using LibreTranslate or similar API
    // For production, use Google Translate API or DeepL
    const response = await axios.post('https://libretranslate.de/translate', {
      q: text,
      source: fromLang,
      target: toLang,
      format: 'text'
    });

    return response.data.translatedText;
  } catch (error) {
    throw new Error('Translation failed: ' + error.message);
  }
};
