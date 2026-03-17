import { generateExplanation, generateExercises, checkPronunciation } from '../services/aiService.js';
import { translateText } from '../services/translationService.js';

export const explainConcept = async (req, res) => {
  try {
    const { concept, language } = req.body;
    const explanation = await generateExplanation(concept, language);
    res.json({ explanation });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const generatePracticeExercises = async (req, res) => {
  try {
    const { topic, difficulty, count } = req.body;
    const exercises = await generateExercises(topic, difficulty, count);
    res.json({ exercises });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const translate = async (req, res) => {
  try {
    const { text, from, to } = req.body;
    const translation = await translateText(text, from, to);
    res.json({ translation });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const evaluatePronunciation = async (req, res) => {
  try {
    const { audioData, text, language } = req.body;
    const evaluation = await checkPronunciation(audioData, text, language);
    res.json(evaluation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
