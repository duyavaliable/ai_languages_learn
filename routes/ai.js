import express from 'express';
import { translate, evaluatePronunciation, rephraseSpeakingText, rephraseSpeakingTextV2, assessSpeakingTranscript, generateSpeakingScript } from '../controllers/aiController.js';
import { protect, authorize } from '../middleware/auth.js';
import uploadAudio from '../middleware/upload.js';

const router = express.Router();

router.post('/translate', protect, translate);
router.post('/pronunciation', protect, evaluatePronunciation);
router.post('/speaking/generate-script', protect, generateSpeakingScript);
router.post('/speaking/rephrase', protect, rephraseSpeakingText);
router.post('/speaking/rephrase/v2', protect, rephraseSpeakingTextV2);
router.post('/speaking/assess', protect, assessSpeakingTranscript);

export default router;
