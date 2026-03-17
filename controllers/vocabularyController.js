import { Vocabulary, Language } from '../models/index.js';

export const getVocabulary = async (req, res) => {
  try {
    const { language, difficulty } = req.query;
    const where = {};

    if (language) where.language_id = language;
    if (difficulty) where.difficulty = difficulty;

    const vocabulary = await Vocabulary.findAll({
      where,
      include: [{ model: Language, as: 'language' }]
    });
    res.json(vocabulary);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getVocabularyById = async (req, res) => {
  try {
    const vocabulary = await Vocabulary.findByPk(req.params.id, {
      include: [{ model: Language, as: 'language' }]
    });

    if (!vocabulary) {
      return res.status(404).json({ message: 'Vocabulary not found' });
    }

    res.json(vocabulary);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createVocabulary = async (req, res) => {
  try {
    const vocabulary = await Vocabulary.create(req.body);
    res.status(201).json(vocabulary);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
