import { Course, Language, Lesson } from '../models/index.js';
import { Op } from 'sequelize';

const SUPPORTED_LANGUAGE_CODES = ['en', 'ja'];

const hasSupportedLanguage = async (languageId) => {
  if (!languageId) {
    return false;
  }

  const language = await Language.findOne({
    where: {
      id: languageId,
      code: {
        [Op.in]: SUPPORTED_LANGUAGE_CODES
      }
    }
  });

  return Boolean(language);
};

export const getCourses = async (req, res) => {
  try {
    const { language, level } = req.query;
    const where = { is_deleted: false };

    if (language) where.language_id = language;
    if (level) where.level = level;

    const courses = await Course.findAll({
      where,
      include: [
        { model: Language, as: 'language' },
        { model: Lesson, as: 'lessons', where: { is_deleted: false }, required: false }
      ],
      order: [['id', 'DESC']]
    });

    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCourseById = async (req, res) => {
  try {
    const course = await Course.findOne({
      where: { id: req.params.id, is_deleted: false },
      include: [
        { model: Language, as: 'language' },
        { model: Lesson, as: 'lessons', where: { is_deleted: false }, required: false }
      ]
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createCourse = async (req, res) => {
  try {
    const { language_id } = req.body;

    const validLanguage = await hasSupportedLanguage(language_id);
    if (!validLanguage) {
      return res.status(400).json({ message: 'language_id must be Tiếng Anh hoặc Tiếng Nhật' });
    }

    const course = await Course.create({ ...req.body, is_deleted: false });
    res.status(201).json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateCourse = async (req, res) => {
  try {
    const course = await Course.findOne({ where: { id: req.params.id, is_deleted: false } });
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'language_id')) {
      const validLanguage = await hasSupportedLanguage(req.body.language_id);
      if (!validLanguage) {
        return res.status(400).json({ message: 'language_id must be Tiếng Anh hoặc Tiếng Nhật' });
      }
    }

    await course.update(req.body);
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDeletedCourses = async (req, res) => {
  try {
    const courses = await Course.findAll({
      where: { is_deleted: true },
      include: [{ model: Language, as: 'language' }],
      order: [['id', 'DESC']]
    });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const restoreCourse = async (req, res) => {
  try {
    const course = await Course.findOne({ where: { id: req.params.id, is_deleted: true } });
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    await course.update({ is_deleted: false });
    res.json({ message: 'Course restored successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteCourse = async (req, res) => {
  try {
    const course = await Course.findOne({ where: { id: req.params.id, is_deleted: false } });
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    await course.update({ is_deleted: true });

    await Lesson.update(
      { is_deleted: true },
      { where: { course_id: course.id, is_deleted: false } }
    );

    res.json({ message: 'Course soft deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
