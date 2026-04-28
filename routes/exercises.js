import express from 'express';
import { getExercises, getExerciseById, updateExerciseContent, deleteExercise, previewExerciseFile } from '../controllers/exerciseController.js';
import { protect, authorize } from '../middleware/auth.js';
import { uploadVocabulary } from '../middleware/upload.js';

const router = express.Router();

router.get('/', protect, getExercises);
router.get('/:id', protect, getExerciseById);
router.put('/:id', protect, authorize('teacher', 'admin'), updateExerciseContent);
router.delete('/:id', protect, authorize('teacher', 'admin'), deleteExercise);
router.post('/preview-parts', protect, authorize('admin', 'teacher'), uploadVocabulary.single('file'), previewExerciseFile);

export default router;
