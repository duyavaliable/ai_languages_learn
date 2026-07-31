import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LibraryBig,
  BookOpen,
  GraduationCap,
  Sparkles,
  Plus,
  Trash2,
  RotateCcw,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import api from '../services/api';
import PageHeader from '../components/admin/ui/PageHeader';
import StatCard from '../components/admin/ui/StatCard';
import StatusBadge from '../components/admin/ui/StatusBadge';
import EmptyState from '../components/admin/ui/EmptyState';
import LoadingScreen from '../components/admin/ui/LoadingScreen';
import Modal from '../components/admin/ui/Modal';
import ConfirmDialog from '../components/admin/ui/ConfirmDialog';

const LEVELS = ['A2', 'B1', 'B2', 'C1'];
const SKILLS = ['reading', 'listening', 'writing', 'speaking'];

const emptyLesson = { course_id: '', title: '', content: '', lesson_order: 1 };
const emptyCourse = { language_id: '', name: '', description: '', level: 'A2', duration: '' };

// ── UI Primitives ──
function Field({ label, children }) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-sm font-medium text-admin-card-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full rounded-admin-sm border border-admin-border bg-admin-background px-3.5 py-2.5 text-sm text-admin-foreground placeholder:text-admin-muted-foreground focus:border-admin-ring focus:outline-none focus:ring-2 focus:ring-admin-ring/30 transition-colors';

function Th({ children, right = false }) {
  return (
    <th className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider text-admin-muted-foreground ${right ? 'text-right' : ''}`}>
      {children}
    </th>
  );
}

function Td({ children, muted = false, right = false, className = '' }) {
  return (
    <td className={`px-5 py-3.5 text-sm ${muted ? 'text-admin-muted-foreground' : 'text-admin-card-foreground'} ${right ? 'text-right' : ''} ${className}`}>
      {children}
    </td>
  );
}

function IconBtn({ onClick, title, danger = false, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded-admin-sm border border-admin-border bg-admin-card text-admin-muted-foreground transition-colors hover:bg-admin-muted hover:text-admin-card-foreground ${
        danger ? 'hover:bg-admin-danger-soft hover:text-admin-danger' : ''
      }`}
    >
      {children}
    </button>
  );
}

const levelTone = (level) => {
  if (level?.toLowerCase() === 'a2' || level === 'beginner') return 'success';
  if (level?.toLowerCase() === 'b1' || level === 'intermediate') return 'primary';
  if (level?.toLowerCase() === 'b2') return 'warning';
  if (level?.toLowerCase() === 'c1') return 'danger';
  return 'neutral';
};

// ════════════════════════════════════════════════════════
// AdminContentManager
// Original API logic preserved, UI completely rewritten
// ════════════════════════════════════════════════════════
export default function AdminContentManager() {
  const navigate = useNavigate();
  const [globalMsg, setGlobalMsg] = useState(null);
  const notify = (text, type = 'success') => {
    setGlobalMsg({ text, type });
    setTimeout(() => setGlobalMsg(null), 3000);
  };
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  const [tab, setTab] = useState('exercises');
  const [confirm, setConfirm] = useState(null);

  // ── Languages ──
  const [languages, setLanguages] = useState([]);

  // ── Courses ──
  const [courses, setCourses] = useState([]);
  const [courseLoading, setCourseLoading] = useState(true);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [editingCourse, setEditingCourse] = useState(null);
  const [courseSubmitting, setCourseSubmitting] = useState(false);
  const [showDeletedCourses, setShowDeletedCourses] = useState(false);
  const [deletedCourses, setDeletedCourses] = useState([]);
  const [deletedCourseLoading, setDeletedCourseLoading] = useState(false);

  // ── Lessons ──
  const [lessons, setLessons] = useState([]);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [filterCourseId, setFilterCourseId] = useState('');
  const [showLessonForm, setShowLessonForm] = useState(false);
  const [lessonForm, setLessonForm] = useState(emptyLesson);
  const [editingLesson, setEditingLesson] = useState(null);
  const [lessonSubmitting, setLessonSubmitting] = useState(false);
  const [showDeletedLessons, setShowDeletedLessons] = useState(false);
  const [deletedLessons, setDeletedLessons] = useState([]);
  const [deletedLessonLoading, setDeletedLessonLoading] = useState(false);

  // ── Exercises ──
  const [exercises, setExercises] = useState([]);
  const [exerciseLoading, setExerciseLoading] = useState(false);
  const [filterExerciseCourseId, setFilterExerciseCourseId] = useState('');
  const [filterExerciseSkill, setFilterExerciseSkill] = useState('');

  useEffect(() => {
    // Note: private route takes care of role in the new layout, but kept for compatibility
    if (currentUser?.role && currentUser.role !== 'admin') {
      navigate('/');
      return;
    }
    api.get('/languages').then((r) => setLanguages(r.data)).catch(() => {});
    fetchCourses();
    fetchExercises();
  }, []);

  const stats = useMemo(() => {
    return {
      courses: courses.length,
      lessons: lessons.length, // For current filtered course
      exercises: exercises.length, // For current filter
    };
  }, [courses, lessons, exercises]);

  // ── Course helpers ──
  const fetchCourses = () => {
    setCourseLoading(true);
    api.get('/courses')
      .then((r) => {
        setCourses(r.data);
        setCourseLoading(false);
      })
      .catch(() => setCourseLoading(false));
  };

  const fetchDeletedCourses = () => {
    setDeletedCourseLoading(true);
    api.get('/courses/deleted')
      .then((r) => {
        setDeletedCourses(r.data);
        setDeletedCourseLoading(false);
      })
      .catch(() => setDeletedCourseLoading(false));
  };

  const openCreateCourse = () => {
    setEditingCourse(null);
    setCourseForm(emptyCourse);
    setShowCourseForm(true);
  };

  const openEditCourse = (c) => {
    setEditingCourse(c.id);
    setCourseForm({
      language_id: c.language_id ?? '',
      name: c.name ?? '',
      description: c.description ?? '',
      level: c.level ?? 'A2',
      duration: c.duration ?? '',
    });
    setShowCourseForm(true);
  };

  const handleCourseSubmit = async (e) => {
    e.preventDefault();
    setCourseSubmitting(true);
    const payload = { ...courseForm, duration: courseForm.duration === '' ? null : Number(courseForm.duration) };
    try {
      if (editingCourse) {
        await api.put(`/courses/${editingCourse}`, payload);
        notify('Cập nhật khóa học thành công');
      } else {
        await api.post('/courses', payload);
        notify('Tạo khóa học thành công');
      }
      setShowCourseForm(false);
      setEditingCourse(null);
      fetchCourses();
    } catch (err) {
      notify(err.response?.data?.message || 'Thao tác thất bại', 'error');
    } finally {
      setCourseSubmitting(false);
    }
  };

  const handleDeleteCourse = (id, name) => {
    setConfirm({
      title: 'Xóa khóa học?',
      description: `Bạn có chắc muốn xóa mềm khóa học "${name}"? Khóa học sẽ được chuyển vào danh sách đã xóa.`,
      confirmLabel: 'Xóa mềm',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api.delete(`/courses/${id}`);
          setCourses((prev) => prev.filter((c) => c.id !== id));
          if (showDeletedCourses) fetchDeletedCourses();
          notify(`Đã xóa mềm khóa học "${name}"`);
        } catch (err) {
          notify(err.response?.data?.message || 'Xóa thất bại', 'error');
        }
      },
    });
  };

  const handleRestoreCourse = async (id, name) => {
    try {
      await api.patch(`/courses/${id}/restore`);
      setDeletedCourses((prev) => prev.filter((c) => c.id !== id));
      fetchCourses();
      notify(`Đã khôi phục khóa học "${name}"`);
    } catch (err) {
      notify(err.response?.data?.message || 'Khôi phục thất bại', 'error');
    }
  };

  const handleToggleDeletedCourses = () => {
    const next = !showDeletedCourses;
    setShowDeletedCourses(next);
    if (next) fetchDeletedCourses();
  };

  // ── Lesson helpers ──
  const fetchLessons = (courseId) => {
    setLessonLoading(true);
    const query = courseId ? `?courseId=${courseId}` : '';
    api.get(`/lessons${query}`)
      .then((r) => {
        setLessons(r.data);
        setLessonLoading(false);
      })
      .catch(() => setLessonLoading(false));
  };

  const fetchDeletedLessons = (courseId) => {
    setDeletedLessonLoading(true);
    const query = courseId ? `?courseId=${courseId}` : '';
    api.get(`/lessons/deleted${query}`)
      .then((r) => {
        setDeletedLessons(r.data);
        setDeletedLessonLoading(false);
      })
      .catch(() => setDeletedLessonLoading(false));
  };

  const handleTabLesson = () => {
    setTab('lessons');
    fetchLessons(filterCourseId);
  };

  const openCreateLesson = () => {
    setEditingLesson(null);
    setLessonForm({ ...emptyLesson, course_id: filterCourseId });
    setShowLessonForm(true);
  };

  const openEditLesson = (l) => {
    setEditingLesson(l.id);
    setLessonForm({
      course_id: l.course_id ?? '',
      title: l.title ?? '',
      content: l.content ?? '',
      lesson_order: l.lesson_order ?? 1,
    });
    setShowLessonForm(true);
  };

  const handleLessonSubmit = async (e) => {
    e.preventDefault();
    setLessonSubmitting(true);
    try {
      if (editingLesson) {
        await api.put(`/lessons/${editingLesson}`, lessonForm);
        notify('Cập nhật bài học thành công');
      } else {
        await api.post('/lessons', lessonForm);
        notify('Tạo bài học thành công');
      }
      setShowLessonForm(false);
      setEditingLesson(null);
      fetchLessons(filterCourseId);
    } catch (err) {
      notify(err.response?.data?.message || 'Thao tác thất bại', 'error');
    } finally {
      setLessonSubmitting(false);
    }
  };

  const handleDeleteLesson = (id, title) => {
    setConfirm({
      title: 'Xóa bài học?',
      description: `Bạn có chắc muốn xóa mềm bài học "${title}"? Bài học có thể khôi phục sau.`,
      confirmLabel: 'Xóa mềm',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api.delete(`/lessons/${id}`);
          setLessons((prev) => prev.filter((l) => l.id !== id));
          if (showDeletedLessons) fetchDeletedLessons(filterCourseId);
          notify(`Đã xóa mềm bài học "${title}"`);
        } catch (err) {
          notify(err.response?.data?.message || 'Xóa thất bại', 'error');
        }
      },
    });
  };

  const handleRestoreLesson = async (id, title) => {
    try {
      await api.patch(`/lessons/${id}/restore`);
      setDeletedLessons((prev) => prev.filter((l) => l.id !== id));
      fetchLessons(filterCourseId);
      notify(`Đã khôi phục bài học "${title}"`);
    } catch (err) {
      notify(err.response?.data?.message || 'Khôi phục thất bại', 'error');
    }
  };

  const handleToggleDeletedLessons = () => {
    const next = !showDeletedLessons;
    setShowDeletedLessons(next);
    if (next) fetchDeletedLessons(filterCourseId);
  };

  // ── Exercise helpers ──
  const fetchExercises = (courseId = filterExerciseCourseId, skill = filterExerciseSkill) => {
    setExerciseLoading(true);
    const params = new URLSearchParams();
    if (courseId) params.set('courseId', courseId);
    if (skill) params.set('skill', skill);
    params.set('includeDeleted', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';

    api.get(`/exercises${query}`)
      .then((r) => {
        setExercises(r.data || []);
        setExerciseLoading(false);
      })
      .catch((err) => {
        notify(err.response?.data?.message || 'Không tải được danh sách exercise', 'error');
        setExerciseLoading(false);
      });
  };

  const handleTabExercises = () => {
    setTab('exercises');
    fetchExercises(filterExerciseCourseId, filterExerciseSkill);
  };

  const handleDeleteExercise = (id, title) => {
    const target = exercises.find((item) => Number(item.id) === Number(id));
    const isSoftDeleted = Boolean(target?.is_deleted);
    const confirmText = isSoftDeleted
      ? `Exercise "${title}" đã xóa mềm. Bạn muốn xóa cứng (vĩnh viễn)?`
      : `Xóa mềm exercise "${title}"? Bạn có thể xóa cứng sau.`;

    setConfirm({
      title: isSoftDeleted ? 'Xóa cứng exercise?' : 'Xóa mềm exercise?',
      description: confirmText,
      confirmLabel: isSoftDeleted ? 'Xóa vĩnh viễn' : 'Xóa mềm',
      onConfirm: async () => {
        setConfirm(null);
        try {
          const res = await api.delete(`/exercises/${id}`);
          const mode = String(res?.data?.mode || '').toLowerCase();
          notify(`Đã ${mode === 'hard' ? 'xóa cứng' : 'xóa mềm'} exercise "${title}"`);
          fetchExercises(filterExerciseCourseId, filterExerciseSkill);
        } catch (err) {
          notify(err.response?.data?.message || 'Xóa exercise thất bại', 'error');
        }
      },
    });
  };

  const langName = (id) => languages.find((l) => l.id === id)?.name ?? id;
  const courseName = (id) => courses.find((c) => c.id === Number(id))?.name ?? id;

  // ── Render ──
  return (
    <div>
      <PageHeader
        title="Quản lý nội dung"
        description="Quản lý khóa học, bài học và các bài tập (exercise) trong hệ thống."
      />

      {globalMsg && (
        <div className={`mb-6 p-4 rounded-admin text-sm font-medium border ${
          globalMsg.type === 'success' ? 'bg-admin-success-soft text-admin-success border-admin-success/20' : 'bg-admin-danger-soft text-admin-danger border-admin-danger/20'
        }`}>
          {globalMsg.text}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={LibraryBig} label="Khóa học" value={stats.courses} tone="primary" />
        <StatCard icon={BookOpen} label="Bài học" value={stats.lessons} tone="success" hint={filterCourseId ? `Trong khóa học đang chọn` : 'Tổng tất cả khóa học'} />
        <StatCard icon={Sparkles} label="Exercise" value={stats.exercises} tone="warning" hint={filterExerciseSkill ? `Kỹ năng: ${filterExerciseSkill}` : 'Tổng tất cả'} />
      </div>

      <div className="mb-6 border-b border-admin-border">
        <nav className="-mb-px flex gap-6">
          {[
            { id: 'courses', label: 'Khóa học' },
            { id: 'lessons', label: 'Bài học' },
            { id: 'exercises', label: 'Exercise' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                if (t.id === 'courses') setTab('courses');
                else if (t.id === 'lessons') handleTabLesson();
                else if (t.id === 'exercises') handleTabExercises();
              }}
              className={`whitespace-nowrap border-b-2 px-1 pb-4 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'border-admin-primary text-admin-primary'
                  : 'border-transparent text-admin-muted-foreground hover:border-admin-border hover:text-admin-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ═══ COURSES TAB ═══ */}
      {tab === 'courses' && (
        <div>
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-bold text-admin-card-foreground">Danh sách khóa học ({courses.length})</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleToggleDeletedCourses}
                className="inline-flex items-center gap-2 rounded-admin-sm border border-admin-border bg-admin-card px-4 py-2 text-sm font-semibold text-admin-card-foreground transition-colors hover:bg-admin-muted"
              >
                {showDeletedCourses ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Đã xóa mềm
              </button>
              <button
                type="button"
                onClick={openCreateCourse}
                className="inline-flex items-center gap-2 rounded-admin-sm bg-admin-primary px-4 py-2.5 text-sm font-semibold text-admin-primary-foreground transition hover:brightness-95"
              >
                <Plus className="h-4 w-4" />
                Thêm khóa học
              </button>
            </div>
          </div>

          {showDeletedCourses && (
            <div className="mb-6 overflow-hidden rounded-admin border border-admin-border bg-admin-card shadow-admin-card">
              <div className="border-b border-admin-border px-5 py-4">
                <h3 className="text-sm font-bold text-admin-card-foreground">Khóa học đã xóa mềm</h3>
              </div>
              {deletedCourseLoading ? (
                <LoadingScreen label="Đang tải danh sách đã xóa..." />
              ) : deletedCourses.length === 0 ? (
                <EmptyState title="Không có dữ liệu" description="Chưa có khóa học nào bị xóa mềm." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-admin-border">
                        <Th>ID</Th>
                        <Th>Tên khóa học</Th>
                        <Th>Ngôn ngữ</Th>
                        <Th right>Thao tác</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {deletedCourses.map((c) => (
                        <tr key={c.id} className="border-b border-admin-border/60 transition-colors last:border-0 hover:bg-admin-muted/40">
                          <Td muted>{c.id}</Td>
                          <Td>
                            <span className="font-medium line-through text-admin-muted-foreground">{c.name}</span>
                          </Td>
                          <Td muted>{c.language?.name ?? langName(c.language_id)}</Td>
                          <Td right>
                            <button
                              type="button"
                              onClick={() => handleRestoreCourse(c.id, c.name)}
                              className="inline-flex items-center gap-1.5 rounded-admin-sm border border-admin-border bg-admin-card px-3 py-1.5 text-xs font-semibold text-admin-success transition-colors hover:bg-admin-success-soft"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Khôi phục
                            </button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="overflow-hidden rounded-admin border border-admin-border bg-admin-card shadow-admin-card">
            {courseLoading ? (
              <LoadingScreen label="Đang tải danh sách khóa học..." />
            ) : courses.length === 0 ? (
              <EmptyState title="Chưa có khóa học nào" description='Nhấn "Thêm khóa học" để tạo mới.' />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-admin-border">
                      <Th>ID</Th>
                      <Th>Tên khóa học</Th>
                      <Th>Ngôn ngữ</Th>
                      <Th>Cấp độ</Th>
                      <Th>Thời lượng</Th>
                      <Th>Bài học</Th>
                      <Th right>Thao tác</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((c) => (
                      <tr key={c.id} className="border-b border-admin-border/60 transition-colors last:border-0 hover:bg-admin-muted/40">
                        <Td muted>{c.id}</Td>
                        <Td>
                          <span className="font-medium text-admin-card-foreground">{c.name}</span>
                        </Td>
                        <Td muted>{c.language?.name ?? langName(c.language_id)}</Td>
                        <Td>
                          <StatusBadge tone={levelTone(c.level)}>{c.level}</StatusBadge>
                        </Td>
                        <Td muted>{c.duration ? `${c.duration}h` : '—'}</Td>
                        <Td muted>{c.lessons?.length ?? 0}</Td>
                        <Td right>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditCourse(c)}
                              className="rounded-admin-sm bg-admin-primary-soft px-3 py-1.5 text-xs font-semibold text-admin-primary transition-colors hover:brightness-95"
                            >
                              Sửa
                            </button>
                            <IconBtn onClick={() => handleDeleteCourse(c.id, c.name)} title="Xóa khóa học" danger>
                              <Trash2 className="h-4 w-4" />
                            </IconBtn>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ LESSONS TAB ═══ */}
      {tab === 'lessons' && (
        <div>
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-bold text-admin-card-foreground">Danh sách bài học ({lessons.length})</h2>
              <div className="relative w-56">
                <select
                  value={filterCourseId}
                  onChange={(e) => {
                    setFilterCourseId(e.target.value);
                    fetchLessons(e.target.value);
                    if (showDeletedLessons) fetchDeletedLessons(e.target.value);
                  }}
                  className={`${inputCls} appearance-none pr-9 py-1.5`}
                >
                  <option value="">-- Tất cả khóa học --</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted-foreground" />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleToggleDeletedLessons}
                className="inline-flex items-center gap-2 rounded-admin-sm border border-admin-border bg-admin-card px-4 py-2 text-sm font-semibold text-admin-card-foreground transition-colors hover:bg-admin-muted"
              >
                {showDeletedLessons ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Đã xóa mềm
              </button>
              <button
                type="button"
                onClick={openCreateLesson}
                className="inline-flex items-center gap-2 rounded-admin-sm bg-admin-primary px-4 py-2.5 text-sm font-semibold text-admin-primary-foreground transition hover:brightness-95"
              >
                <Plus className="h-4 w-4" />
                Thêm bài học
              </button>
            </div>
          </div>

          {showDeletedLessons && (
            <div className="mb-6 overflow-hidden rounded-admin border border-admin-border bg-admin-card shadow-admin-card">
              <div className="border-b border-admin-border px-5 py-4">
                <h3 className="text-sm font-bold text-admin-card-foreground">Bài học đã xóa mềm</h3>
              </div>
              {deletedLessonLoading ? (
                <LoadingScreen label="Đang tải danh sách đã xóa..." />
              ) : deletedLessons.length === 0 ? (
                <EmptyState title="Không có dữ liệu" description="Chưa có bài học nào bị xóa mềm." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-admin-border">
                        <Th>ID</Th>
                        <Th>Tên bài học</Th>
                        <Th>Khóa học</Th>
                        <Th right>Thao tác</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {deletedLessons.map((l) => (
                        <tr key={l.id} className="border-b border-admin-border/60 transition-colors last:border-0 hover:bg-admin-muted/40">
                          <Td muted>{l.id}</Td>
                          <Td>
                            <span className="font-medium line-through text-admin-muted-foreground">{l.title}</span>
                          </Td>
                          <Td muted>{l.course?.name ?? courseName(l.course_id)}</Td>
                          <Td right>
                            <button
                              type="button"
                              onClick={() => handleRestoreLesson(l.id, l.title)}
                              className="inline-flex items-center gap-1.5 rounded-admin-sm border border-admin-border bg-admin-card px-3 py-1.5 text-xs font-semibold text-admin-success transition-colors hover:bg-admin-success-soft"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Khôi phục
                            </button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="overflow-hidden rounded-admin border border-admin-border bg-admin-card shadow-admin-card">
            {lessonLoading ? (
              <LoadingScreen label="Đang tải danh sách bài học..." />
            ) : lessons.length === 0 ? (
              <EmptyState title="Chưa có bài học nào" description='Nhấn "Thêm bài học" để tạo mới.' />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-admin-border">
                      <Th>ID</Th>
                      <Th>Tên bài học</Th>
                      <Th>Khóa học</Th>
                      <Th>Thứ tự</Th>
                      <Th>Nội dung</Th>
                      <Th right>Thao tác</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {lessons.map((l) => (
                      <tr key={l.id} className="border-b border-admin-border/60 transition-colors last:border-0 hover:bg-admin-muted/40">
                        <Td muted>{l.id}</Td>
                        <Td>
                          <span className="font-medium text-admin-card-foreground">{l.title}</span>
                        </Td>
                        <Td muted>{l.course?.name ?? courseName(l.course_id)}</Td>
                        <Td muted>Bài {l.lesson_order}</Td>
                        <Td muted>
                          <div className="max-w-[200px] truncate">{l.content || '—'}</div>
                        </Td>
                        <Td right>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditLesson(l)}
                              className="rounded-admin-sm bg-admin-primary-soft px-3 py-1.5 text-xs font-semibold text-admin-primary transition-colors hover:brightness-95"
                            >
                              Sửa
                            </button>
                            <IconBtn onClick={() => handleDeleteLesson(l.id, l.title)} title="Xóa bài học" danger>
                              <Trash2 className="h-4 w-4" />
                            </IconBtn>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ EXERCISES TAB ═══ */}
      {tab === 'exercises' && (
        <div>
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-bold text-admin-card-foreground">Danh sách Exercise ({exercises.length})</h2>
              <button
                type="button"
                onClick={() => navigate('/admin/create-content')}
                className="inline-flex items-center gap-2 rounded-admin-sm bg-admin-primary px-3 py-1.5 text-xs font-semibold text-admin-primary-foreground transition hover:brightness-95"
              >
                <Plus className="h-4 w-4" />
                Thêm Exercise
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative w-48">
                <select
                  value={filterExerciseCourseId}
                  onChange={(e) => {
                    const nextCourse = e.target.value;
                    setFilterExerciseCourseId(nextCourse);
                    fetchExercises(nextCourse, filterExerciseSkill);
                  }}
                  className={`${inputCls} appearance-none pr-9 py-2`}
                >
                  <option value="">-- Tất cả khóa học --</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted-foreground" />
              </div>
              <div className="relative w-48">
                <select
                  value={filterExerciseSkill}
                  onChange={(e) => {
                    const nextSkill = e.target.value;
                    setFilterExerciseSkill(nextSkill);
                    fetchExercises(filterExerciseCourseId, nextSkill);
                  }}
                  className={`${inputCls} appearance-none pr-9 py-2`}
                >
                  <option value="">-- Tất cả kỹ năng --</option>
                  {SKILLS.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted-foreground" />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-admin border border-admin-border bg-admin-card shadow-admin-card">
            {exerciseLoading ? (
              <LoadingScreen label="Đang tải danh sách exercise..." />
            ) : exercises.length === 0 ? (
              <EmptyState title="Chưa có exercise nào" description="Bạn có thể tạo exercise mới từ trang Thêm nội dung." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-admin-border">
                      <Th>STT</Th>
                      <Th>Tiêu đề</Th>
                      <Th>Khóa học</Th>
                      <Th>Kỹ năng</Th>
                      <Th>Trạng thái</Th>
                      <Th right>Thao tác</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {exercises.map((e, idx) => (
                      <tr key={e.id} className="border-b border-admin-border/60 transition-colors last:border-0 hover:bg-admin-muted/40">
                        <Td muted>{idx + 1}</Td>
                        <Td>
                          <span className="font-medium text-admin-card-foreground">{e.title}</span>
                        </Td>
                        <Td muted>{courseName(e.course_id)}</Td>
                        <Td>
                          <StatusBadge tone="neutral" className="uppercase tracking-wider">
                            {e.skill_type}
                          </StatusBadge>
                        </Td>
                        <Td>
                          {e.is_deleted ? (
                            <StatusBadge tone="danger">Đã xóa mềm</StatusBadge>
                          ) : (
                            <StatusBadge tone="success">Đang hoạt động</StatusBadge>
                          )}
                        </Td>
                        <Td right>
                          <div className="flex items-center justify-end gap-2">
                            <IconBtn
                              onClick={() => navigate(`/courses/${e.course_id}/skills/${e.skill_type}/exercises/${e.id}`)}
                              title="Xem chi tiết"
                            >
                              <Eye className="h-4 w-4" />
                            </IconBtn>
                            <IconBtn onClick={() => handleDeleteExercise(e.id, e.title)} title={e.is_deleted ? 'Xóa cứng' : 'Xóa mềm'} danger>
                              <Trash2 className="h-4 w-4" />
                            </IconBtn>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODALS ── */}
      <Modal
        open={showCourseForm}
        title={editingCourse ? 'Sửa khóa học' : 'Thêm khóa học mới'}
        onClose={() => setShowCourseForm(false)}
      >
        <form onSubmit={handleCourseSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tên khóa học *">
              <input type="text" value={courseForm.name} onChange={(e) => setCourseForm((p) => ({ ...p, name: e.target.value }))} placeholder="Nhập tên khóa học" className={inputCls} required />
            </Field>
            <Field label="Ngôn ngữ *">
              <div className="relative">
                <select value={courseForm.language_id} onChange={(e) => setCourseForm((p) => ({ ...p, language_id: e.target.value }))} className={`${inputCls} appearance-none pr-9`} required>
                  <option value="">-- Chọn ngôn ngữ --</option>
                  {languages.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted-foreground" />
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Cấp độ">
              <div className="relative">
                <select value={courseForm.level} onChange={(e) => setCourseForm((p) => ({ ...p, level: e.target.value }))} className={`${inputCls} appearance-none pr-9`}>
                  {LEVELS.map((lv) => (
                    <option key={lv} value={lv}>
                      {lv}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted-foreground" />
              </div>
            </Field>
            <Field label="Thời lượng (giờ)">
              <input type="number" min="0" value={courseForm.duration} onChange={(e) => setCourseForm((p) => ({ ...p, duration: e.target.value }))} placeholder="Ví dụ: 20" className={inputCls} />
            </Field>
          </div>
          <Field label="Mô tả">
            <textarea value={courseForm.description} onChange={(e) => setCourseForm((p) => ({ ...p, description: e.target.value }))} placeholder="Mô tả khóa học..." className={`${inputCls} min-h-[80px] resize-y`} />
          </Field>
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={() => setShowCourseForm(false)} className="rounded-admin-sm border border-admin-border bg-admin-card px-4 py-2 text-sm font-semibold text-admin-card-foreground transition-colors hover:bg-admin-muted">
              Hủy
            </button>
            <button type="submit" disabled={courseSubmitting} className="inline-flex items-center gap-2 rounded-admin-sm bg-admin-primary px-4 py-2 text-sm font-semibold text-admin-primary-foreground transition hover:brightness-95 disabled:opacity-60">
              <Plus className="h-4 w-4" />
              {courseSubmitting ? 'Đang lưu...' : 'Lưu khóa học'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showLessonForm}
        title={editingLesson ? 'Sửa bài học' : 'Thêm bài học mới'}
        onClose={() => setShowLessonForm(false)}
      >
        <form onSubmit={handleLessonSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tên bài học *">
              <input type="text" value={lessonForm.title} onChange={(e) => setLessonForm((p) => ({ ...p, title: e.target.value }))} placeholder="Nhập tên bài học" className={inputCls} required />
            </Field>
            <Field label="Khóa học *">
              <div className="relative">
                <select value={lessonForm.course_id} onChange={(e) => setLessonForm((p) => ({ ...p, course_id: e.target.value }))} className={`${inputCls} appearance-none pr-9`} required>
                  <option value="">-- Chọn khóa học --</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted-foreground" />
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Thứ tự bài">
              <input type="number" min="1" value={lessonForm.lesson_order} onChange={(e) => setLessonForm((p) => ({ ...p, lesson_order: Number(e.target.value) }))} className={inputCls} />
            </Field>
            <div className="hidden sm:block" />
          </div>
          <Field label="Nội dung">
            <textarea value={lessonForm.content} onChange={(e) => setLessonForm((p) => ({ ...p, content: e.target.value }))} placeholder="Nội dung bài học..." className={`${inputCls} min-h-[90px] resize-y`} />
          </Field>
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={() => setShowLessonForm(false)} className="rounded-admin-sm border border-admin-border bg-admin-card px-4 py-2 text-sm font-semibold text-admin-card-foreground transition-colors hover:bg-admin-muted">
              Hủy
            </button>
            <button type="submit" disabled={lessonSubmitting} className="inline-flex items-center gap-2 rounded-admin-sm bg-admin-primary px-4 py-2 text-sm font-semibold text-admin-primary-foreground transition hover:brightness-95 disabled:opacity-60">
              <Plus className="h-4 w-4" />
              {lessonSubmitting ? 'Đang lưu...' : 'Lưu bài học'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
