import { Lesson, Vocabulary, Grammar, Language, UserProgress } from '../models/index.js';

const normalizeSkillType = (skill) => {
  if (!skill) return null;
  const value = String(skill).trim().toLowerCase();
  const supported = ['listening', 'speaking', 'reading', 'writing'];
  return supported.includes(value) ? value : null;
};

const normalizeCefrLevel = (level) => {
  if (!level) return null;
  const value = String(level).trim().toUpperCase();
  const supported = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  return supported.includes(value) ? value : null;
};

export const getLessons = async (req, res) => {
  try {
    const { languageId, courseId, skill, exerciseOnly, cefrLevel } = req.query;
    const where = { is_deleted: false };

    const resolvedLanguageId = languageId || courseId;
    if (resolvedLanguageId) {
      where.language_id = resolvedLanguageId;
    }

    const skillType = normalizeSkillType(skill);
    if (skill) {
      if (!skillType) {
        return res.status(400).json({ message: 'skill must be listening, speaking, reading or writing' });
      }
      where.skill_type = skillType;
    }

    if (exerciseOnly === 'true') {
      where.is_ai_exercise = true;
    }

    const normalizedCefr = normalizeCefrLevel(cefrLevel);
    if (cefrLevel) {
      if (!normalizedCefr) {
        return res.status(400).json({ message: 'cefrLevel must be one of A1, A2, B1, B2, C1, C2' });
      }
      where.cefr_level = normalizedCefr;
    }

    const lessons = await Lesson.findAll({
      where,
      include: [
        { model: Vocabulary, as: 'vocabularyItems' },
        { model: Grammar, as: 'grammarPoints' }
      ],
      order: [['lesson_order', 'ASC']]
    });

    res.json(lessons);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getLessonById = async (req, res) => {
  try {
    const lesson = await Lesson.findOne({
      where: { id: req.params.id, is_deleted: false },
      include: [
        { model: Vocabulary, as: 'vocabularyItems' },
        { model: Grammar, as: 'grammarPoints' },
        { model: Language, as: 'language' }
      ]
    });

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    res.json(lesson);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createLesson = async (req, res) => {
  try {
    const {
      language_id,
      course_id,
      title,
      content,
      lesson_order,
      skill_type,
      cefr_level,
      is_ai_exercise
    } = req.body;

    const resolvedLanguageId = language_id || course_id;

    if (!resolvedLanguageId || !title) {
      return res.status(400).json({ message: 'language_id and title are required' });
    }

    const normalizedSkillType = normalizeSkillType(skill_type);
    if (skill_type && !normalizedSkillType) {
      return res.status(400).json({ message: 'skill_type must be listening, speaking, reading or writing' });
    }

    const normalizedCefrLevel = normalizeCefrLevel(cefr_level);
    if (cefr_level && !normalizedCefrLevel) {
      return res.status(400).json({ message: 'cefr_level must be one of A1, A2, B1, B2, C1, C2' });
    }

    const lesson = await Lesson.create({
      language_id: resolvedLanguageId,
      title,
      content,
      lesson_order: lesson_order || 1,
      skill_type: normalizedSkillType,
      cefr_level: normalizedCefrLevel,
      is_ai_exercise: Boolean(is_ai_exercise),
      is_deleted: false
    });
    res.status(201).json(lesson);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateLesson = async (req, res) => {
  try {
    const { id } = req.params;
    const lesson = await Lesson.findOne({ where: { id, is_deleted: false } });
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'language_id') || Object.prototype.hasOwnProperty.call(req.body, 'course_id')) {
      const resolvedLanguageId = req.body.language_id || req.body.course_id;
      req.body.language_id = resolvedLanguageId;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'skill_type')) {
      const normalizedSkillType = normalizeSkillType(req.body.skill_type);
      if (req.body.skill_type && !normalizedSkillType) {
        return res.status(400).json({ message: 'skill_type must be listening, speaking, reading or writing' });
      }
      req.body.skill_type = normalizedSkillType;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'cefr_level')) {
      const normalizedCefrLevel = normalizeCefrLevel(req.body.cefr_level);
      if (req.body.cefr_level && !normalizedCefrLevel) {
        return res.status(400).json({ message: 'cefr_level must be one of A1, A2, B1, B2, C1, C2' });
      }
      req.body.cefr_level = normalizedCefrLevel;
    }

    await lesson.update(req.body);
    res.json(lesson);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDeletedLessons = async (req, res) => {
  try {
    const { languageId, courseId } = req.query;
    const where = { is_deleted: true };
    const resolvedLanguageId = languageId || courseId;
    if (resolvedLanguageId) {
      where.language_id = resolvedLanguageId;
    }

    const lessons = await Lesson.findAll({
      where,
      include: [{ model: Language, as: 'language' }],
      order: [['lesson_order', 'ASC']]
    });
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const restoreLesson = async (req, res) => {
  try {
    const lesson = await Lesson.findOne({ where: { id: req.params.id, is_deleted: true } });
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    await lesson.update({ is_deleted: false });
    res.json({ message: 'Lesson restored successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteLesson = async (req, res) => {
  try {
    const lesson = await Lesson.findOne({ where: { id: req.params.id, is_deleted: false } });
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    await lesson.update({ is_deleted: true });
    res.json({ message: 'Lesson soft deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const completeLesson = async (req, res) => {
  try {
    const { lessonId, score, courseId } = req.body;

    let progress = await UserProgress.findOne({
      where: {
        user_id: req.user.id,
        lesson_id: lessonId
      }
    });

    if (!progress) {
      progress = await UserProgress.create({
        user_id: req.user.id,
        lesson_id: lessonId,
        score: score || 0,
        status: 1,
        last_accessed: new Date()
      });
    } else {
      await progress.update({
        score: score || progress.score,
        status: 1,
        last_accessed: new Date()
      });
    }

    res.json(progress);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
