import express from 'express';
import { getExercises, getExerciseById, updateExerciseContent, deleteExercise } from '../controllers/exerciseController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', protect, getExercises);
router.get('/:id', protect, getExerciseById);
router.put('/:id', protect, authorize('teacher', 'admin'), updateExerciseContent);
router.delete('/:id', protect, authorize('teacher', 'admin'), deleteExercise);

export default router;
