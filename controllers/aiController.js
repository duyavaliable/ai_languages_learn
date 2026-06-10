import { generateExplanation, generateExercises, generateExercisesForCourseSkill, refineExerciseSet, checkPronunciation, rephraseSpeakingFragment, generateSpeakingPracticeAssessment, generateVstepModelScript } from '../services/aiService.js';
import { translateText } from '../services/translationService.js';
import { Exercise } from '../models/index.js';
import fs from 'fs/promises';
import path from 'path';
import { getUploadsAudioDir, toPublicAudioUrl } from '../utils/storage.js';

const SUPPORTED_SKILLS = ['listening', 'speaking', 'reading', 'writing'];
const SUPPORTED_CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const toCefrLevel = (value) => String(value || '').trim().toUpperCase();
const toSkill = (value) => String(value || '').trim().toLowerCase();

export const explainConcept = async (req, res) => {
  try {
    const { concept, language } = req.body;
    const explanation = await generateExplanation(concept, language);
    res.json({ explanation });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const generatePracticeExercises = async (req, res) => {
  const startedAt = Date.now();
  console.log('[AI Controller] generatePracticeExercises received', {
    course_id: req.body?.course_id,
    exerciseTitle: req.body?.exerciseTitle,
    skill: req.body?.skill,
    cefrLevel: req.body?.cefrLevel,
    count: req.body?.count
  });

  try {
    const { difficulty, count, course_id, skill, cefrLevel, exerciseTitle } = req.body;

    if (course_id || skill || cefrLevel) {
      const normalizedSkill = toSkill(skill);
      const normalizedLevel = toCefrLevel(cefrLevel);

      if (!course_id) {
        return res.status(400).json({ message: 'course_id is required for teacher exercise generation' });
      }

      if (!SUPPORTED_SKILLS.includes(normalizedSkill)) {
        return res.status(400).json({ message: 'skill must be listening, speaking, reading, or writing' });
      }

      if (!SUPPORTED_CEFR.includes(normalizedLevel)) {
        return res.status(400).json({ message: 'cefrLevel must be one of A1, A2, B1, B2, C1, C2' });
      }

      let audioUpload = null;
      if (normalizedSkill === 'listening') {
        if (!req.file) {
          return res.status(400).json({ message: 'audioFile is required for listening exercises' });
        }

        const ext = resolveAudioExt(req.file.mimetype);
        const fileName = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
        const targetDir = getUploadsAudioDir();
        await fs.mkdir(targetDir, { recursive: true });
        const targetPath = path.join(targetDir, fileName);
        await fs.writeFile(targetPath, req.file.buffer);

        audioUpload = {
          audioUrl: toPublicAudioUrl(fileName),
          base64: req.file.buffer.toString('base64'),
          mimeType: req.file.mimetype
        };
      }

      const exercises = await generateExercisesForCourseSkill({
        skill: normalizedSkill,
        cefrLevel: normalizedLevel,
        count,
        audioInput: audioUpload
      });

      const normalizedTitle = String(exerciseTitle || '').trim();
      const exerciseName = normalizedTitle || `Bài ${safeNowLabel()} - ${normalizedSkill.toUpperCase()} ${normalizedLevel}`;

      const exerciseContent = {
        type: 'ai_quiz',
        skill: normalizedSkill,
        cefrLevel: normalizedLevel,
        readingPassage: exercises.readingPassage || '',
        taskPrompt: exercises.taskPrompt || '',
        sampleAnswer: exercises.sampleAnswer || '',
        questions: Array.isArray(exercises.questions) ? exercises.questions : []
      };

      const createdExercise = await Exercise.create({
        course_id,
        title: exerciseName,
        skill_type: normalizedSkill,
        reading_passage: exerciseContent.readingPassage || null,
        task_prompt: exerciseContent.taskPrompt || null,
        sample_answer: exerciseContent.sampleAnswer || null,
        audio_url: audioUpload?.audioUrl || null,
        questions_json: JSON.stringify(exerciseContent.questions || []),
        time_limit_sec: resolveTimeLimit(normalizedSkill, exerciseContent.questions),
        is_deleted: false
      });

      console.log('[AI Controller] generatePracticeExercises success', {
        mode: 'teacher',
        durationMs: Date.now() - startedAt,
        savedExercises: 1,
        courseId: Number(course_id),
        skill: normalizedSkill,
        cefrLevel: normalizedLevel
      });

      return res.json({
        exerciseSet: exerciseContent,
        savedExercises: 1,
        exerciseId: createdExercise.id,
        exerciseTitle: createdExercise.title,
        audioUrl: audioUpload?.audioUrl || null,
        courseId: Number(course_id),
        skill: normalizedSkill
      });
    }

    const exercises = await generateExercises(difficulty, count);
    console.log('[AI Controller] generatePracticeExercises success', {
      mode: 'general',
      durationMs: Date.now() - startedAt,
      count: Array.isArray(exercises) ? exercises.length : 0
    });
    return res.json({ exercises });
  } catch (error) {
    console.error('[AI Controller] generatePracticeExercises failed', {
      route: '/api/ai/generate-exercises or /api/ai/teacher/generate-exercises',
      body: {
        difficulty: req.body?.difficulty,
        count: req.body?.count,
        course_id: req.body?.course_id,
        exerciseTitle: req.body?.exerciseTitle,
        skill: req.body?.skill,
        cefrLevel: req.body?.cefrLevel
      },
      durationMs: Date.now() - startedAt,
      message: error?.message,
      stack: error?.stack
    });
    res.status(500).json({ message: error.message });
  }
};

export const refinePracticeExercise = async (req, res) => {
  try {
    const { exerciseId, feedback } = req.body;

    if (!exerciseId) {
      return res.status(400).json({ message: 'exerciseId is required' });
    }

    const exercise = await Exercise.findOne({ where: { id: exerciseId, is_deleted: false } });
    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }

    const currentExercise = {
      title: exercise.title,
      skill: exercise.skill_type,
      readingPassage: exercise.reading_passage,
      taskPrompt: exercise.task_prompt,
      sampleAnswer: exercise.sample_answer,
      questions: JSON.parse(exercise.questions_json || '[]')
    };

    const revised = await refineExerciseSet({
      skill: exercise.skill_type,
      cefrLevel: undefined,
      feedback,
      currentExercise
    });

    await exercise.update({
      reading_passage: revised.readingPassage || null,
      task_prompt: revised.taskPrompt || null,
      sample_answer: revised.sampleAnswer || null,
      questions_json: JSON.stringify(revised.questions || [])
    });

    return res.json({
      exerciseId: exercise.id,
      exerciseTitle: exercise.title,
      exerciseSet: revised
    });
  } catch (error) {
    console.error('[AI Controller] refinePracticeExercise failed', {
      message: error?.message,
      stack: error?.stack,
      body: req.body
    });
    return res.status(500).json({ message: error.message });
  }
};

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
  try {
    const { question } = req.body || {};
    if (!String(question || '').trim()) {
      return res.status(400).json({ message: 'question is required' });
    }
    const result = await generateVstepModelScript({ question });
    return res.json(result);
  } catch (error) {
    console.error('[AI Controller] generateSpeakingScript failed', { message: error?.message, stack: error?.stack });
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

    return res.json(result);
  } catch (error) {
    console.error('[AI Controller] assessSpeakingTranscript failed', { message: error?.message, stack: error?.stack });
    return res.status(500).json({ message: error.message });
  }
};
