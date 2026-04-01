import express from 'express';
import { explainConcept, generatePracticeExercises, translate, evaluatePronunciation } from '../controllers/aiController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.post('/explain', protect, explainConcept);
router.post('/generate-exercises', protect, generatePracticeExercises);
router.post('/teacher/generate-exercises', protect, authorize('teacher'), generatePracticeExercises);
router.post('/translate', protect, translate);
router.post('/pronunciation', protect, evaluatePronunciation);

export default router;
