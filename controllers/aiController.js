import { checkPronunciation, rephraseSpeakingFragment, generateSpeakingPracticeAssessment, generateVstepModelScript, rephraseSpeakingFragmentV2 } from '../services/aiService.js';
import { translateText } from '../services/translationService.js';
import { Exercise } from '../models/index.js';
import fs from 'fs/promises';
import path from 'path';
import { getUploadsAudioDir, toPublicAudioUrl } from '../utils/storage.js';

const SUPPORTED_SKILLS = ['listening', 'speaking', 'reading', 'writing'];
const SUPPORTED_CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const toCefrLevel = (value) => String(value || '').trim().toUpperCase();
const toSkill = (value) => String(value || '').trim().toLowerCase();







const resolveAudioExt = (mimeType) => {
  const map = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a'
  };
  return map[mimeType] || 'mp3';
};

const resolveTimeLimit = (skill, questions) => {
  const questionCount = Array.isArray(questions) ? questions.length : 0;
  if (skill === 'writing' || skill === 'speaking') return 900;
  return Math.max(questionCount * 90, 300);
};

const safeNowLabel = () => {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `${dd}${mm}-${hh}${mi}`;
};

export const translate = async (req, res) => {
  try {
    const { text, from, to } = req.body;
    const translation = await translateText(text, from, to);
    res.json({ translation });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const evaluatePronunciation = async (req, res) => {
  try {
    const { audioData, text, language } = req.body;
    const evaluation = await checkPronunciation(audioData, text, language);
    res.json(evaluation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const generateSpeakingScript = async (req, res) => {
  const t0 = Date.now();
  try {
    const { question, part } = req.body || {};
    if (!String(question || '').trim()) {
      return res.status(400).json({ message: 'question is required' });
    }
    const result = await generateVstepModelScript({ question, part });
    console.log('[AI Controller] generateSpeakingScript done', { totalMs: Date.now() - t0 });
    return res.json(result);
  } catch (error) {
    console.error('[AI Controller] generateSpeakingScript failed', { message: error?.message, totalMs: Date.now() - t0 });
    return res.status(500).json({ message: error.message });
  }
};

export const rephraseSpeakingText = async (req, res) => {
  try {
    const { selectedText, originalScript, action, context } = req.body || {};
    if (!String(selectedText || '').trim()) {
      return res.status(400).json({ message: 'selectedText is required' });
    }

    const result = await rephraseSpeakingFragment({
      selectedText,
      originalScript,
      action,
      context
    });

    return res.json(result);
  } catch (error) {
    console.error('[AI Controller] rephraseSpeakingText failed', { message: error?.message, stack: error?.stack });
    return res.status(500).json({ message: error.message });
  }
};

export const assessSpeakingTranscript = async (req, res) => {
  const t0 = Date.now();
  try {
    const {
      vstepQuestion,
      modelScript,
      finalTranscript,
      detectedErrors = [],
      omissionCount = 0,
      additionCount = 0,
      mispronunciationCount = 0
    } = req.body || {};

    if (!String(finalTranscript || '').trim()) {
      return res.status(400).json({ message: 'finalTranscript is required' });
    }

    const result = await generateSpeakingPracticeAssessment({
      vstepQuestion,
      modelScript,
      finalTranscript,
      detectedErrors,
      omissionCount,
      additionCount,
      mispronunciationCount
    });

    console.log('[AI Controller] assessSpeakingTranscript done', { totalMs: Date.now() - t0 });
    return res.json(result);
  } catch (error) {
    console.error('[AI Controller] assessSpeakingTranscript failed', { message: error?.message, totalMs: Date.now() - t0 });
    return res.status(500).json({ message: error.message });
  }
};

export const rephraseSpeakingTextV2 = async (req, res) => {
  try {
    const { selectedText, originalScript } = req.body || {};
    
    if (!String(selectedText || '').trim()) {
      return res.status(400).json({ message: 'selectedText is required' });
    }

    const result = await rephraseSpeakingFragmentV2({
      selectedText,
      originalScript
    });

    return res.json(result);
  } catch (error) {
    console.error('[AI Controller] rephraseSpeakingTextV2 failed', { message: error?.message, stack: error?.stack });
    return res.status(500).json({ message: error.message });
  }
};
