import express from 'express';
import { getVocabulary, getVocabularyById, createVocabulary } from '../controllers/vocabularyController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getVocabulary);
router.get('/:id', getVocabularyById);
router.post('/', protect, authorize('admin', 'teacher'), createVocabulary);

export default router;
