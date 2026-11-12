import { Exercise, Language } from '../models/index.js';

/**
 * Ngôn ngữ của một "khóa ảo" = ngôn ngữ của các bài trong đó.
 *
 * Trước đây hàm này gán cứng `language_id: null`, nên giao diện không biết khóa
 * là tiếng Anh hay tiếng Nhật. Hệ quả: trang chọn kỹ năng luôn hiện bộ VSTEP
 * (Nghe/Nói/Đọc/Viết) — khóa tiếng Nhật hiện ô "Viết" không có bài, và thiếu
 * hẳn ô "Ngữ pháp" dù có bài.
 *
 * Lấy theo ĐA SỐ, phòng khi một khóa lỡ lẫn bài khác ngôn ngữ.
 */
const pickLanguage = (exercises) => {
  const count = new Map();
  for (const e of exercises) {
    if (!e.language_id) continue;
    count.set(e.language_id, (count.get(e.language_id) || 0) + 1);
  }
  if (!count.size) return { language_id: null, language: null };
  const [bestId] = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  const withLang = exercises.find((e) => e.language_id === bestId && e.language);
  return {
    language_id: bestId,
    language: withLang?.language
      ? {
        id: withLang.language.id,
        name: withLang.language.name,
        code: withLang.language.code
      }
      : null
  };
};

const buildCourseSummary = (courseId, exercises) => {
  const { language_id, language } = pickLanguage(exercises);
  return {
    id: Number(courseId),
    language_id,
    language,
    name: `Khóa ${courseId}`,
    description: null,
    level: null,
    duration: null,
    is_deleted: false,
    exercises_count: exercises.length
  };
};

const loadVirtualCourses = async () => {
  const exercises = await Exercise.findAll({
    where: { is_deleted: false },
    include: [{
      model: Language, as: 'language', attributes: ['id', 'name', 'code'],
      required: false
    }],
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
