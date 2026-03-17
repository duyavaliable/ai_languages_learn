import { Grammar, Language } from '../models/index.js';

export const getGrammar = async (req, res) => {
  try {
    const { language, difficulty } = req.query;
    const where = {};

    if (language) where.language_id = language;
    if (difficulty) where.difficulty = difficulty;

    const grammar = await Grammar.findAll({
      where,
      include: [{ model: Language, as: 'language' }]
    });
    res.json(grammar);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getGrammarById = async (req, res) => {
  try {
    const grammar = await Grammar.findByPk(req.params.id, {
      include: [{ model: Language, as: 'language' }]
    });

    if (!grammar) {
      return res.status(404).json({ message: 'Grammar not found' });
    }

    res.json(grammar);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createGrammar = async (req, res) => {
  try {
    const grammar = await Grammar.create(req.body);
    res.status(201).json(grammar);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
