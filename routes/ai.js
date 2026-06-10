import express from 'express';
import { explainConcept, generatePracticeExercises, refinePracticeExercise, translate, evaluatePronunciation, rephraseSpeakingText, assessSpeakingTranscript, generateSpeakingScript } from '../controllers/aiController.js';
import { protect, authorize } from '../middleware/auth.js';
import uploadAudio from '../middleware/upload.js';

const router = express.Router();

router.post('/explain', protect, explainConcept);
router.post('/generate-exercises', protect, generatePracticeExercises);
router.post('/teacher/generate-exercises', protect, authorize('teacher'), uploadAudio.single('audioFile'), generatePracticeExercises);
router.post('/teacher/refine-exercise', protect, authorize('teacher'), refinePracticeExercise);
router.post('/translate', protect, translate);
router.post('/pronunciation', protect, evaluatePronunciation);
router.post('/speaking/generate-script', protect, generateSpeakingScript);
router.post('/speaking/rephrase', protect, rephraseSpeakingText);
router.post('/speaking/assess', protect, assessSpeakingTranscript);

export default router;
