import { Lesson, Vocabulary, Grammar, Course, UserProgress } from '../models/index.js';

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
    const { courseId, skill, exerciseOnly, cefrLevel } = req.query;
    const where = { is_deleted: false };

    if (courseId) {
      where.course_id = courseId;
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
        { model: Course, as: 'course' }
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
      course_id,
      title,
      content,
      lesson_order,
      skill_type,
      cefr_level,
      is_ai_exercise
    } = req.body;

    if (!course_id || !title) {
      return res.status(400).json({ message: 'course_id and title are required' });
    }

    const course = await Course.findOne({ where: { id: course_id, is_deleted: false } });
    if (!course) {
      return res.status(400).json({ message: 'course_id is invalid or deleted' });
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
      course_id,
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

    if (Object.prototype.hasOwnProperty.call(req.body, 'course_id')) {
      const course = await Course.findOne({ where: { id: req.body.course_id, is_deleted: false } });
      if (!course) {
        return res.status(400).json({ message: 'course_id is invalid or deleted' });
      }
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
    const { courseId } = req.query;
    const where = { is_deleted: true };
    if (courseId) {
      where.course_id = courseId;
    }

    const lessons = await Lesson.findAll({
      where,
      include: [{ model: Course, as: 'course' }],
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

    const course = await Course.findOne({ where: { id: lesson.course_id, is_deleted: false } });
    if (!course) {
      return res.status(400).json({ message: 'Cannot restore lesson because course is deleted' });
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
