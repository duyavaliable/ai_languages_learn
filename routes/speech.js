import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { protect } from '../middleware/auth.js';
import { gradeSpeechWithAI } from '../services/aiService.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/audio/' });

// POST /api/speech/assess - Receive audio, transcribe, grade pronunciation/fluency
router.post('/assess', protect, upload.single('audio'), async (req, res) => {
  try {
    const audioFile = req.file;
    const frontendTranscript = String(req.body?.frontend_transcript || '').trim();
    const speakingPrompt = String(req.body?.speaking_prompt || '').trim();

    if (!audioFile) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    console.log('[speech/assess] Received audio file', {
      filename: audioFile.filename,
      mimetype: audioFile.mimetype,
      size: audioFile.size,
      frontendTranscriptLength: frontendTranscript.length,
      speakingPromptLength: speakingPrompt.length
    });

    // Path to saved audio file
    const audioPath = audioFile.path;

    // Step 1: Grade using AI (VSTEP speaking rubric)
    const gradeResult = await gradeSpeechWithAI({
      audioPath,
      audioMimeType: audioFile.mimetype,
      speakingPrompt,
      standardTranscript: frontendTranscript,
      frontendTranscript
    });

    console.log('[speech/assess] AI grading completed', {
      pronunciationScore: gradeResult.pronunciation_score,
      fluencyScore: gradeResult.fluency_score,
      feedbackLength: gradeResult.feedback?.length || 0
    });

    // Step 2: Clean up temp audio file
    try {
      fs.unlinkSync(audioPath);
    } catch (cleanupErr) {
      console.warn('[speech/assess] Failed to cleanup audio file', { error: cleanupErr.message });
    }

    // Step 3: Return results
    res.json({
      transcript: gradeResult.transcript || '',
      standard_transcript: frontendTranscript,
      speaking_prompt: speakingPrompt,
      pronunciation_score: gradeResult.pronunciation_score,
      fluency_score: gradeResult.fluency_score,
      grammar_score: gradeResult.grammar_score,
      vocabulary_score: gradeResult.vocabulary_score,
      task_fulfillment_score: gradeResult.task_fulfillment_score,
      feedback: gradeResult.feedback,
      errors: gradeResult.errors || []
    });
  } catch (err) {
    console.error('[speech/assess] Error during assessment', {
      message: err.message,
      stack: err.stack
    });

    // Cleanup on error
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
    }

    res.status(500).json({
      error: 'speech_assessment_failed',
      message: err.message || 'Failed to assess speech'
    });
  }
});

export default router;
