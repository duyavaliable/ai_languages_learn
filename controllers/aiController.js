import { generateExplanation, generateExercises, generateExercisesForCourseSkill, checkPronunciation } from '../services/aiService.js';
import { translateText } from '../services/translationService.js';
import { Course, Lesson } from '../models/index.js';

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
    count: req.body?.count,
    topic: req.body?.topic
  });

  try {
    const { topic, difficulty, count, course_id, skill, cefrLevel, exerciseTitle } = req.body;

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

      const course = await Course.findOne({ where: { id: course_id, is_deleted: false } });
      if (!course) {
        return res.status(400).json({ message: 'course_id is invalid or deleted' });
      }

      const exercises = await generateExercisesForCourseSkill({
        skill: normalizedSkill,
        cefrLevel: normalizedLevel,
        count,
        topic
      });

      const maxOrderLesson = await Lesson.findOne({
        where: { course_id, is_deleted: false },
        order: [['lesson_order', 'DESC']]
      });
      const nextOrder = maxOrderLesson?.lesson_order ? Number(maxOrderLesson.lesson_order) + 1 : 1;

      const normalizedTitle = String(exerciseTitle || '').trim();
      const lessonTitle = normalizedTitle || `Bài ${nextOrder} - ${normalizedSkill.toUpperCase()} ${normalizedLevel}`;

      const lessonContent = {
        type: 'ai_quiz',
        skill: normalizedSkill,
        cefrLevel: normalizedLevel,
        topic: String(topic || '').trim(),
        readingPassage: exercises.readingPassage || '',
        questions: Array.isArray(exercises.questions) ? exercises.questions : []
      };

      const createdLesson = await Lesson.create({
        course_id,
        title: lessonTitle,
        content: JSON.stringify(lessonContent),
        lesson_order: nextOrder,
        skill_type: normalizedSkill,
        cefr_level: normalizedLevel,
        is_ai_exercise: true,
        is_deleted: false
      });

      console.log('[AI Controller] generatePracticeExercises success', {
        mode: 'teacher',
        durationMs: Date.now() - startedAt,
        savedLessons: 1,
        courseId: Number(course_id),
        skill: normalizedSkill,
        cefrLevel: normalizedLevel
      });

      return res.json({
        exerciseSet: lessonContent,
        savedLessons: 1,
        lessonId: createdLesson.id,
        lessonTitle: createdLesson.title,
        courseId: Number(course_id),
        skill: normalizedSkill,
        cefrLevel: normalizedLevel
      });
    }

    const exercises = await generateExercises(topic, difficulty, count);
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
        topic: req.body?.topic,
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
