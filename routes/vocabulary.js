import express from 'express';
import { getVocabulary, getVocabularyById, createVocabulary, updateVocabulary, previewVocabularyUpload, importVocabularyBatch } from '../controllers/vocabularyController.js';
import { protect, authorize } from '../middleware/auth.js';
import { uploadVocabulary } from '../middleware/upload.js';

const router = express.Router();

router.get('/', getVocabulary);
router.post('/preview', protect, authorize('admin', 'teacher'), uploadVocabulary.single('file'), previewVocabularyUpload);
router.post('/preview-upload', protect, authorize('admin', 'teacher'), uploadVocabulary.single('file'), previewVocabularyUpload);
router.post('/import', protect, authorize('admin', 'teacher'), importVocabularyBatch);
router.post('/import-batch', protect, authorize('admin', 'teacher'), importVocabularyBatch);
router.post('/', protect, authorize('admin', 'teacher'), createVocabulary);
router.put('/:id', protect, authorize('admin', 'teacher'), updateVocabulary);
router.get('/:id', getVocabularyById);

export default router;
