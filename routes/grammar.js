import express from 'express';
import { getGrammar, getGrammarById, createGrammar } from '../controllers/grammarController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getGrammar);
router.get('/:id', getGrammarById);
router.post('/', protect, authorize('admin', 'teacher'), createGrammar);

export default router;
