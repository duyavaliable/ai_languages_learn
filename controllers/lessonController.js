import { Lesson, Language, UserProgress } from '../models/index.js';

export const getLessons = async (req, res) => {
  try {
    const { languageId, courseId } = req.query;
    const where = { is_deleted: false };

    const resolvedLanguageId = languageId || courseId;
    if (resolvedLanguageId) {
      where.language_id = resolvedLanguageId;
    }

    const lessons = await Lesson.findAll({
      where,
      order: [['id', 'ASC']]
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
      lesson_order
    } = req.body;

    const resolvedLanguageId = language_id || course_id;

    if (!resolvedLanguageId || !title) {
      return res.status(400).json({ message: 'language_id and title are required' });
    }

    const lesson = await Lesson.create({
      language_id: resolvedLanguageId,
      title,
      lesson_order: lesson_order || 1,
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
