import { Exercise } from '../models/index.js';

const buildCourseSummary = (courseId, exercises) => {
  const firstExercise = exercises[0] || {};
  return {
    id: Number(courseId),
    language_id: null,
    name: `Khóa ${courseId}`,
    description: null,
    level: firstExercise.cefr_level || null,
    duration: null,
    is_deleted: false,
    lessons: [],
    exercises_count: exercises.length
  };
};

const loadVirtualCourses = async () => {
  const exercises = await Exercise.findAll({
    where: { is_deleted: false },
    order: [['id', 'DESC']]
  });

  const grouped = new Map();
  for (const exercise of exercises) {
    const courseId = Number(exercise.course_id);
    if (!courseId) {
      continue;
    }

    if (!grouped.has(courseId)) {
      grouped.set(courseId, []);
    }
    grouped.get(courseId).push(exercise);
  }

  return Array.from(grouped.entries())
    .map(([courseId, rows]) => buildCourseSummary(courseId, rows))
    .sort((a, b) => b.id - a.id);
};

export const getCourses = async (req, res) => {
  try {
    const courses = await loadVirtualCourses();
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCourseById = async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    const courses = await loadVirtualCourses();
    const course = courses.find((item) => Number(item.id) === courseId);

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
    res.status(410).json({ message: 'Course table has been removed. Course CRUD is disabled.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateCourse = async (req, res) => {
  try {
    res.status(410).json({ message: 'Course table has been removed. Course CRUD is disabled.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDeletedCourses = async (req, res) => {
  try {
    res.json([]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const restoreCourse = async (req, res) => {
  try {
    res.status(410).json({ message: 'Course table has been removed. Course CRUD is disabled.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteCourse = async (req, res) => {
  try {
    res.status(410).json({ message: 'Course table has been removed. Course CRUD is disabled.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
