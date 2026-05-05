import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const LEVELS = ['A2', 'B1', 'B2', 'C1'];
const SKILLS = ['reading', 'listening', 'writing', 'speaking'];

const emptyLesson = { course_id: '', title: '', content: '', lesson_order: 1 };
const emptyCourse = { language_id: '', name: '', description: '', level: 'A2', duration: '' };

function AdminContentManager() {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  const [tab, setTab] = useState('exercises');

  // ── Languages ──
  const [languages, setLanguages] = useState([]);

  // ── Courses ──
  const [courses, setCourses] = useState([]);
  const [courseLoading, setCourseLoading] = useState(true);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [editingCourse, setEditingCourse] = useState(null); // id being edited
  const [courseMsg, setCourseMsg] = useState(null);
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
  const [lessonMsg, setLessonMsg] = useState(null);
  const [showDeletedLessons, setShowDeletedLessons] = useState(false);
  const [deletedLessons, setDeletedLessons] = useState([]);
  const [deletedLessonLoading, setDeletedLessonLoading] = useState(false);

  // ── Exercises ──
  const [exercises, setExercises] = useState([]);
  const [exerciseLoading, setExerciseLoading] = useState(false);
  const [filterExerciseCourseId, setFilterExerciseCourseId] = useState('');
  const [filterExerciseSkill, setFilterExerciseSkill] = useState('');
  const [exerciseMsg, setExerciseMsg] = useState(null);

  useEffect(() => {
    if (currentUser.role !== 'admin') {
      navigate('/');
      return;
    }
    api.get('/languages').then(r => setLanguages(r.data)).catch(() => {});
    fetchCourses();
  }, []);

  // ── Course helpers ──
  const fetchCourses = () => {
    setCourseLoading(true);
    api.get('/courses')
      .then(r => { setCourses(r.data); setCourseLoading(false); })
      .catch(() => setCourseLoading(false));
  };

  const fetchDeletedCourses = () => {
    setDeletedCourseLoading(true);
    api.get('/courses/deleted')
      .then(r => { setDeletedCourses(r.data); setDeletedCourseLoading(false); })
      .catch(() => setDeletedCourseLoading(false));
  };

  const openCreateCourse = () => {
    setEditingCourse(null);
    setCourseForm(emptyCourse);
    setShowCourseForm(true);
    setCourseMsg(null);
  };

  const openEditCourse = (c) => {
    setEditingCourse(c.id);
    setCourseForm({
      language_id: c.language_id ?? '',
      name: c.name ?? '',
      description: c.description ?? '',
      level: c.level ?? 'beginner',
      duration: c.duration ?? ''
    });
    setShowCourseForm(true);
    setCourseMsg(null);
  };

  const handleCourseSubmit = async (e) => {
    e.preventDefault();
    setCourseMsg(null);
    const payload = { ...courseForm, duration: courseForm.duration === '' ? null : Number(courseForm.duration) };
    try {
      if (editingCourse) {
        await api.put(`/courses/${editingCourse}`, payload);
        setCourseMsg({ type: 'success', text: 'Cập nhật khóa học thành công' });
      } else {
        await api.post('/courses', payload);
        setCourseMsg({ type: 'success', text: 'Tạo khóa học thành công' });
      }
      setShowCourseForm(false);
      setEditingCourse(null);
      fetchCourses();
    } catch (err) {
      setCourseMsg({ type: 'error', text: err.response?.data?.message || 'Thao tác thất bại' });
    }
  };

  const handleDeleteCourse = async (id, name) => {
    if (!window.confirm(`Xóa mềm khóa học "${name}"? Bạn có thể khôi phục sau.`)) return;
    setCourseMsg(null);
    try {
      await api.delete(`/courses/${id}`);
      setCourses(prev => prev.filter(c => c.id !== id));
      if (showDeletedCourses) {
        fetchDeletedCourses();
      }
      setCourseMsg({ type: 'success', text: `Đã xóa mềm khóa học "${name}"` });
    } catch (err) {
      setCourseMsg({ type: 'error', text: err.response?.data?.message || 'Xóa thất bại' });
    }
  };

  const handleRestoreCourse = async (id, name) => {
    setCourseMsg(null);
    try {
      await api.patch(`/courses/${id}/restore`);
      setDeletedCourses(prev => prev.filter(c => c.id !== id));
      fetchCourses();
      setCourseMsg({ type: 'success', text: `Đã khôi phục khóa học "${name}"` });
    } catch (err) {
      setCourseMsg({ type: 'error', text: err.response?.data?.message || 'Khôi phục thất bại' });
    }
  };

  // ── Lesson helpers ──
  const fetchLessons = (courseId) => {
    setLessonLoading(true);
    const query = courseId ? `?courseId=${courseId}` : '';
    api.get(`/lessons${query}`)
      .then(r => { setLessons(r.data); setLessonLoading(false); })
      .catch(() => setLessonLoading(false));
  };

  const fetchDeletedLessons = (courseId) => {
    setDeletedLessonLoading(true);
    const query = courseId ? `?courseId=${courseId}` : '';
    api.get(`/lessons/deleted${query}`)
      .then(r => { setDeletedLessons(r.data); setDeletedLessonLoading(false); })
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
    setLessonMsg(null);
  };

  const openEditLesson = (l) => {
    setEditingLesson(l.id);
    setLessonForm({
      course_id: l.course_id ?? '',
      title: l.title ?? '',
      content: l.content ?? '',
      lesson_order: l.lesson_order ?? 1
    });
    setShowLessonForm(true);
    setLessonMsg(null);
  };

  const handleLessonSubmit = async (e) => {
    e.preventDefault();
    setLessonMsg(null);
    try {
      if (editingLesson) {
        await api.put(`/lessons/${editingLesson}`, lessonForm);
        setLessonMsg({ type: 'success', text: 'Cập nhật bài học thành công' });
      } else {
        await api.post('/lessons', lessonForm);
        setLessonMsg({ type: 'success', text: 'Tạo bài học thành công' });
      }
      setShowLessonForm(false);
      setEditingLesson(null);
      fetchLessons(filterCourseId);
    } catch (err) {
      setLessonMsg({ type: 'error', text: err.response?.data?.message || 'Thao tác thất bại' });
    }
  };

  const handleDeleteLesson = async (id, title) => {
    if (!window.confirm(`Xóa mềm bài học "${title}"? Bạn có thể khôi phục sau.`)) return;
    setLessonMsg(null);
    try {
      await api.delete(`/lessons/${id}`);
      setLessons(prev => prev.filter(l => l.id !== id));
      if (showDeletedLessons) {
        fetchDeletedLessons(filterCourseId);
      }
      setLessonMsg({ type: 'success', text: `Đã xóa mềm bài học "${title}"` });
    } catch (err) {
      setLessonMsg({ type: 'error', text: err.response?.data?.message || 'Xóa thất bại' });
    }
  };

  const handleRestoreLesson = async (id, title) => {
    setLessonMsg(null);
    try {
      await api.patch(`/lessons/${id}/restore`);
      setDeletedLessons(prev => prev.filter(l => l.id !== id));
      fetchLessons(filterCourseId);
      setLessonMsg({ type: 'success', text: `Đã khôi phục bài học "${title}"` });
    } catch (err) {
      setLessonMsg({ type: 'error', text: err.response?.data?.message || 'Khôi phục thất bại' });
    }
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
        setExerciseMsg({ type: 'error', text: err.response?.data?.message || 'Không tải được danh sách exercise' });
        setExerciseLoading(false);
      });
  };

  const handleTabExercises = () => {
    setTab('exercises');
    setExerciseMsg(null);
    fetchExercises(filterExerciseCourseId, filterExerciseSkill);
  };

  const handleDeleteExercise = async (id, title) => {
    const target = exercises.find((item) => Number(item.id) === Number(id));
    const isSoftDeleted = Boolean(target?.is_deleted);
    const confirmText = isSoftDeleted
      ? `Exercise "${title}" đã xóa mềm. Bạn muốn xóa cứng (vĩnh viễn)?`
      : `Xóa mềm exercise "${title}"? Bạn có thể bấm xóa lần nữa để xóa cứng.`;

    if (!window.confirm(confirmText)) return;

    setExerciseMsg(null);
    try {
      const res = await api.delete(`/exercises/${id}`);
      const mode = String(res?.data?.mode || '').toLowerCase();
      if (mode === 'hard') {
        setExerciseMsg({ type: 'success', text: `Đã xóa cứng exercise "${title}"` });
      } else {
        setExerciseMsg({ type: 'success', text: `Đã xóa mềm exercise "${title}"` });
      }
      fetchExercises(filterExerciseCourseId, filterExerciseSkill);
    } catch (err) {
      setExerciseMsg({ type: 'error', text: err.response?.data?.message || 'Xóa exercise thất bại' });
    }
  };

  const exerciseCount = exercises.length;

  const langName = (id) => languages.find(l => l.id === id)?.name ?? id;
  const courseName = (id) => courses.find(c => c.id === Number(id))?.name ?? id;

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button onClick={() => navigate('/')} style={styles.backBtn}>← Quay lại</button>
          <span style={styles.logo}>Quản lý nội dung</span>
        </div>
        <span style={styles.welcomeText}>
          {currentUser.role === 'admin' ? 'Admin' : 'Teacher'}: <strong>{currentUser.username}</strong>
        </span>
      </div>

      <div style={styles.content}>
        <section style={styles.heroCard}>
          <div>
            <p style={styles.heroEyebrow}>Content dashboard</p>
            <h1 style={styles.heroTitle}>Quản lý nội dung</h1>
            <p style={styles.heroDescription}>
              Tập trung vào exercise trong một workspace trực quan, gọn và dễ thao tác.
            </p>
          </div>
          <div style={styles.heroStats}>
            <div style={styles.statCard}>
              <span style={styles.statLabel}>Exercise</span>
              <strong style={styles.statValue}>{exerciseCount}</strong>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <div style={styles.tabBar}>
          <button
            style={tab === 'exercises' ? styles.tabActive : styles.tab}
            onClick={handleTabExercises}
          >
            Exercise
          </button>
        </div>

        {/* ═══ COURSES TAB ═══ */}
        {false && tab === 'courses' && (
          <div>
            <div style={styles.topBar}>
              <h2 style={styles.sectionTitle}>Danh sách khóa học ({courses.length})</h2>
              <div style={styles.actionGroup}>
                <button
                  onClick={() => {
                    const next = !showDeletedCourses;
                    setShowDeletedCourses(next);
                    if (next) {
                      fetchDeletedCourses();
                    }
                  }}
                  style={styles.secondaryBtn}
                >
                  {showDeletedCourses ? 'Ẩn đã xóa mềm' : 'Xem đã xóa mềm'}
                </button>
                <button onClick={openCreateCourse} style={styles.createBtn}>
                  {showCourseForm && !editingCourse ? '✕ Đóng form' : '+ Thêm khóa học'}
                </button>
              </div>
            </div>

            {courseMsg && <Msg data={courseMsg} />}

            {showCourseForm && (
              <div style={styles.formCard}>
                <h3 style={styles.formTitle}>{editingCourse ? '✏️ Sửa khóa học' : '➕ Thêm khóa học mới'}</h3>
                <form onSubmit={handleCourseSubmit}>
                  <div style={styles.formRow}>
                    <Field label="Tên khóa học *">
                      <input style={styles.input} value={courseForm.name}
                        onChange={e => setCourseForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Nhập tên khóa học" required />
                    </Field>
                    <Field label="Ngôn ngữ *">
                      <select style={styles.input} value={courseForm.language_id}
                        onChange={e => setCourseForm(p => ({ ...p, language_id: e.target.value }))} required>
                        <option value="">-- Chọn ngôn ngữ --</option>
                        {languages.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div style={styles.formRow}>
                    <Field label="Cấp độ">
                      <select style={styles.input} value={courseForm.level}
                        onChange={e => setCourseForm(p => ({ ...p, level: e.target.value }))}>
                        {LEVELS.map(lv => <option key={lv} value={lv}>{lv.charAt(0).toUpperCase() + lv.slice(1)}</option>)}
                      </select>
                    </Field>
                    <Field label="Thời lượng (giờ)">
                      <input style={styles.input} type="number" min="0" value={courseForm.duration}
                        onChange={e => setCourseForm(p => ({ ...p, duration: e.target.value }))}
                        placeholder="Ví dụ: 20" />
                    </Field>
                  </div>
                  <Field label="Mô tả">
                    <textarea style={{ ...styles.input, height: '80px', resize: 'vertical' }}
                      value={courseForm.description}
                      onChange={e => setCourseForm(p => ({ ...p, description: e.target.value }))}
                      placeholder="Mô tả khóa học..." />
                  </Field>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                    <button type="submit" style={styles.submitBtn}>
                      {editingCourse ? 'Lưu thay đổi' : 'Tạo khóa học'}
                    </button>
                    <button type="button" onClick={() => { setShowCourseForm(false); setEditingCourse(null); }} style={styles.cancelBtn}>
                      Hủy
                    </button>
                  </div>
                </form>
              </div>
            )}

            {showDeletedCourses && (
              <div style={styles.formCard}>
                <h3 style={styles.formTitle}>🗑️ Khóa học đã xóa mềm ({deletedCourses.length})</h3>
                {deletedCourseLoading && <p style={styles.statusText}>Đang tải...</p>}
                {!deletedCourseLoading && deletedCourses.length === 0 && (
                  <p style={styles.statusText}>Chưa có khóa học nào đã xóa mềm.</p>
                )}
                {!deletedCourseLoading && deletedCourses.length > 0 && (
                  <div style={styles.tableWrapper}>
                    <table style={styles.table}>
                      <thead>
                        <tr style={styles.tableHeadRow}>
                          <th style={styles.th}>ID</th>
                          <th style={styles.th}>Tên khóa học</th>
                          <th style={styles.th}>Ngôn ngữ</th>
                          <th style={styles.th}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deletedCourses.map(c => (
                          <tr key={c.id} style={styles.tableRow}>
                            <td style={styles.td}>{c.id}</td>
                            <td style={styles.td}><strong>{c.name}</strong></td>
                            <td style={styles.td}>{c.language?.name ?? langName(c.language_id)}</td>
                            <td style={styles.td}>
                              <button onClick={() => handleRestoreCourse(c.id, c.name)} style={styles.restoreBtn}>
                                ♻️ Khôi phục
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {courseLoading && <p style={styles.statusText}>Đang tải...</p>}
            {!courseLoading && (
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeadRow}>
                      <th style={styles.th}>ID</th>
                      <th style={styles.th}>Tên khóa học</th>
                      <th style={styles.th}>Ngôn ngữ</th>
                      <th style={styles.th}>Cấp độ</th>
                      <th style={styles.th}>Thời lượng</th>
                      <th style={styles.th}>Số bài học</th>
                      <th style={styles.th}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map(c => (
                      <tr key={c.id} style={styles.tableRow}>
                        <td style={styles.td}>{c.id}</td>
                        <td style={styles.td}><strong>{c.name}</strong></td>
                        <td style={styles.td}>{c.language?.name ?? langName(c.language_id)}</td>
                        <td style={styles.td}><span style={levelBadge(c.level)}>{c.level}</span></td>
                        <td style={styles.td}>{c.duration ? `${c.duration}h` : '—'}</td>
                        <td style={styles.td}>{c.lessons?.length ?? 0}</td>
                        <td style={styles.td}>
                          <div style={styles.actionGroup}>
                            <button onClick={() => openEditCourse(c)} style={styles.editBtn}>✏️ Sửa</button>
                            <button onClick={() => handleDeleteCourse(c.id, c.name)} style={styles.deleteBtn}>🗑️ Xóa</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {courses.length === 0 && (
                      <tr><td colSpan={7} style={styles.emptyCell}>Chưa có khóa học nào.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ═══ LESSONS TAB ═══ */}
        {false && tab === 'lessons' && (
          <div>
            <div style={styles.topBar}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <h2 style={styles.sectionTitle}>Bài học ({lessons.length})</h2>
                <select
                  style={{ ...styles.input, width: '220px', margin: 0 }}
                  value={filterCourseId}
                  onChange={e => {
                    setFilterCourseId(e.target.value);
                    fetchLessons(e.target.value);
                    if (showDeletedLessons) {
                      fetchDeletedLessons(e.target.value);
                    }
                  }}
                >
                  <option value="">-- Tất cả khóa học --</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={styles.actionGroup}>
                <button
                  onClick={() => {
                    const next = !showDeletedLessons;
                    setShowDeletedLessons(next);
                    if (next) {
                      fetchDeletedLessons(filterCourseId);
                    }
                  }}
                  style={styles.secondaryBtn}
                >
                  {showDeletedLessons ? 'Ẩn đã xóa mềm' : 'Xem đã xóa mềm'}
                </button>
                <button onClick={openCreateLesson} style={styles.createBtn}>
                  {showLessonForm && !editingLesson ? '✕ Đóng form' : '+ Thêm bài học'}
                </button>
              </div>
            </div>

            {lessonMsg && <Msg data={lessonMsg} />}

            {showLessonForm && (
              <div style={styles.formCard}>
                <h3 style={styles.formTitle}>{editingLesson ? '✏️ Sửa bài học' : '➕ Thêm bài học mới'}</h3>
                <form onSubmit={handleLessonSubmit}>
                  <div style={styles.formRow}>
                    <Field label="Tên bài học *">
                      <input style={styles.input} value={lessonForm.title}
                        onChange={e => setLessonForm(p => ({ ...p, title: e.target.value }))}
                        placeholder="Nhập tên bài học" required />
                    </Field>
                    <Field label="Khóa học *">
                      <select style={styles.input} value={lessonForm.course_id}
                        onChange={e => setLessonForm(p => ({ ...p, course_id: e.target.value }))} required>
                        <option value="">-- Chọn khóa học --</option>
                        {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div style={styles.formRow}>
                    <Field label="Thứ tự bài">
                      <input style={styles.input} type="number" min="1" value={lessonForm.lesson_order}
                        onChange={e => setLessonForm(p => ({ ...p, lesson_order: Number(e.target.value) }))} />
                    </Field>
                    <div style={{ flex: 1 }} />
                  </div>
                  <Field label="Nội dung">
                    <textarea style={{ ...styles.input, height: '90px', resize: 'vertical' }}
                      value={lessonForm.content}
                      onChange={e => setLessonForm(p => ({ ...p, content: e.target.value }))}
                      placeholder="Nội dung bài học..." />
                  </Field>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                    <button type="submit" style={styles.submitBtn}>
                      {editingLesson ? 'Lưu thay đổi' : 'Tạo bài học'}
                    </button>
                    <button type="button" onClick={() => { setShowLessonForm(false); setEditingLesson(null); }} style={styles.cancelBtn}>
                      Hủy
                    </button>
                  </div>
                </form>
              </div>
            )}

            {showDeletedLessons && (
              <div style={styles.formCard}>
                <h3 style={styles.formTitle}>🗑️ Bài học đã xóa mềm ({deletedLessons.length})</h3>
                {deletedLessonLoading && <p style={styles.statusText}>Đang tải...</p>}
                {!deletedLessonLoading && deletedLessons.length === 0 && (
                  <p style={styles.statusText}>Chưa có bài học nào đã xóa mềm.</p>
                )}
                {!deletedLessonLoading && deletedLessons.length > 0 && (
                  <div style={styles.tableWrapper}>
                    <table style={styles.table}>
                      <thead>
                        <tr style={styles.tableHeadRow}>
                          <th style={styles.th}>ID</th>
                          <th style={styles.th}>Tên bài học</th>
                          <th style={styles.th}>Khóa học</th>
                          <th style={styles.th}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deletedLessons.map(l => (
                          <tr key={l.id} style={styles.tableRow}>
                            <td style={styles.td}>{l.id}</td>
                            <td style={styles.td}><strong>{l.title}</strong></td>
                            <td style={styles.td}>{l.course?.name ?? courseName(l.course_id)}</td>
                            <td style={styles.td}>
                              <button onClick={() => handleRestoreLesson(l.id, l.title)} style={styles.restoreBtn}>
                                ♻️ Khôi phục
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {lessonLoading && <p style={styles.statusText}>Đang tải...</p>}
            {!lessonLoading && (
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeadRow}>
                      <th style={styles.th}>ID</th>
                      <th style={styles.th}>Tên bài học</th>
                      <th style={styles.th}>Khóa học</th>
                      <th style={styles.th}>Thứ tự</th>
                      <th style={styles.th}>Nội dung</th>
                      <th style={styles.th}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lessons.map(l => (
                      <tr key={l.id} style={styles.tableRow}>
                        <td style={styles.td}>{l.id}</td>
                        <td style={styles.td}><strong>{l.title}</strong></td>
                        <td style={styles.td}>{l.course?.name ?? courseName(l.course_id)}</td>
                        <td style={styles.td}>Bài {l.lesson_order}</td>
                        <td style={{ ...styles.td, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.content || '—'}
                        </td>
                        <td style={styles.td}>
                          <div style={styles.actionGroup}>
                            <button onClick={() => openEditLesson(l)} style={styles.editBtn}>✏️ Sửa</button>
                            <button onClick={() => handleDeleteLesson(l.id, l.title)} style={styles.deleteBtn}>🗑️ Xóa</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {lessons.length === 0 && (
                      <tr><td colSpan={6} style={styles.emptyCell}>Chưa có bài học nào.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ═══ EXERCISES TAB ═══ */}
        {tab === 'exercises' && (
          <div>
            <div style={styles.topBar}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <h2 style={styles.sectionTitle}>Exercise ({exercises.length})</h2>
                <select
                  style={{ ...styles.input, width: '180px', margin: 0 }}
                  value={filterExerciseSkill}
                  onChange={(e) => {
                    const nextSkill = e.target.value;
                    setFilterExerciseSkill(nextSkill);
                    fetchExercises(filterExerciseCourseId, nextSkill);
                  }}
                >
                  <option value="">-- Tất cả kỹ năng --</option>
                  {SKILLS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {exerciseMsg && <Msg data={exerciseMsg} />}

            {exerciseLoading && <p style={styles.statusText}>Đang tải...</p>}
            {!exerciseLoading && (
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeadRow}>
                      <th style={styles.th}>STT</th>
                      <th style={styles.th}>Tiêu đề</th>
                      <th style={styles.th}>Mã khóa</th>
                      <th style={styles.th}>Kỹ năng</th>
                      <th style={styles.th}>Trạng thái</th>
                      <th style={styles.th}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exercises.map((e, idx) => (
                      <tr key={e.id} style={styles.tableRow}>
                        <td style={styles.td}>{idx + 1}</td>
                        <td style={styles.td}><strong>{e.title}</strong></td>
                        <td style={styles.td}>{e.course_id}</td>
                        <td style={styles.td}>{String(e.skill_type || '').toUpperCase()}</td>
                        <td style={styles.td}>
                          {e.is_deleted ? (
                            <span style={styles.deletedBadge}>Đã xóa mềm</span>
                          ) : (
                            <span style={styles.activeBadge}>Đang hoạt động</span>
                          )}
                        </td>
                        <td style={styles.td}>
                          <div style={styles.actionGroup}>
                            <button
                              onClick={() => navigate(`/courses/${e.course_id}/skills/${e.skill_type}/exercises/${e.id}`)}
                              style={styles.editBtn}
                            >
                              👁 Xem
                            </button>
                            <button onClick={() => handleDeleteExercise(e.id, e.title)} style={styles.deleteBtn}>🗑 {e.is_deleted ? 'Xóa cứng' : 'Xóa mềm'}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {exercises.length === 0 && (
                      <tr><td colSpan={7} style={styles.emptyCell}>Chưa có exercise nào.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Small helper components ──
function Field({ label, children }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

function Msg({ data }) {
  return (
    <div style={data.type === 'success' ? styles.successBanner : styles.errorBanner}>
      {data.text}
    </div>
  );
}

const levelBadge = (level) => ({
  background: level === 'beginner' ? '#c6f6d5' : level === 'intermediate' ? '#bee3f8' : '#e9d8fd',
  color: level === 'beginner' ? '#276749' : level === 'intermediate' ? '#2b6cb0' : '#553c9a',
  padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600'
});

const styles = {
  wrapper: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    minHeight: '100vh',
    background: 'radial-gradient(circle at top left, #eef4ff 0%, #f7f9ff 35%, #eef2ff 100%)'
  },
  header: {
    background: 'rgba(255,255,255,0.84)',
    backdropFilter: 'blur(18px)',
    borderBottom: '1px solid rgba(148,163,184,0.18)',
    padding: '16px 32px', display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', color: '#0f172a', boxShadow: '0 8px 30px rgba(15,23,42,0.06)'
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  backBtn: {
    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', color: '#fff',
    border: 'none', padding: '7px 16px',
    borderRadius: '999px', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
  },
  logo: { fontSize: '20px', fontWeight: '800', letterSpacing: '-0.02em' },
  welcomeText: { fontSize: '14px', color: '#475569' },
  content: { maxWidth: '1280px', margin: '0 auto', padding: '28px 24px 40px' },
  heroCard: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.3fr) minmax(280px, 0.9fr)',
    gap: '20px',
    padding: '24px 28px',
    marginBottom: '20px',
    borderRadius: '28px',
    background: 'linear-gradient(135deg, rgba(79,70,229,0.96) 0%, rgba(124,58,237,0.92) 52%, rgba(59,130,246,0.9) 100%)',
    color: '#fff',
    boxShadow: '0 24px 60px rgba(79,70,229,0.22)'
  },
  heroEyebrow: { margin: 0, fontSize: '12px', fontWeight: '700', letterSpacing: '0.24em', textTransform: 'uppercase', opacity: 0.85 },
  heroTitle: { margin: '8px 0 10px', fontSize: '30px', lineHeight: 1.1, letterSpacing: '-0.04em' },
  heroDescription: { margin: 0, maxWidth: '680px', color: 'rgba(255,255,255,0.86)', fontSize: '14px', lineHeight: 1.7 },
  heroStats: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', alignSelf: 'stretch' },
  statCard: {
    borderRadius: '20px',
    background: 'rgba(255,255,255,0.16)',
    border: '1px solid rgba(255,255,255,0.18)',
    padding: '16px'
  },
  statLabel: { display: 'block', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.16em', opacity: 0.82, marginBottom: '10px' },
  statValue: { fontSize: '28px', lineHeight: 1, fontWeight: '800' },
  tabBar: { display: 'flex', gap: '10px', marginBottom: '24px', borderBottom: '1px solid rgba(148,163,184,0.18)', paddingBottom: '0' },
  tab: {
    background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(148,163,184,0.16)', padding: '10px 20px', cursor: 'pointer',
    fontSize: '15px', fontWeight: '700', color: '#64748b', borderBottom: 'none', marginBottom: '-1px', borderTopLeftRadius: '14px', borderTopRightRadius: '14px'
  },
  tabActive: {
    background: '#fff', border: '1px solid rgba(148,163,184,0.16)', padding: '10px 20px', cursor: 'pointer',
    fontSize: '15px', fontWeight: '800', color: '#4f46e5', borderBottom: 'none', marginBottom: '-1px', borderTopLeftRadius: '14px', borderTopRightRadius: '14px', boxShadow: '0 -2px 18px rgba(15,23,42,0.04)'
  },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '16px', flexWrap: 'wrap' },
  sectionTitle: { color: '#0f172a', margin: 0, fontSize: '18px', fontWeight: '800', letterSpacing: '-0.02em' },
  createBtn: {
    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    color: '#fff', border: 'none', padding: '10px 22px',
    borderRadius: '999px', cursor: 'pointer', fontWeight: '600', fontSize: '14px'
  },
  secondaryBtn: {
    background: '#fff', color: '#334155', border: '1px solid rgba(148,163,184,0.22)',
    padding: '10px 16px', borderRadius: '999px', cursor: 'pointer',
    fontWeight: '600', fontSize: '14px'
  },
  formCard: {
    background: 'rgba(248,250,252,0.92)', borderRadius: '22px', padding: '24px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)', marginBottom: '20px',
    border: '1px solid rgba(148,163,184,0.18)'
  },
  formTitle: { color: '#0f172a', marginTop: 0, marginBottom: '18px', fontSize: '16px', fontWeight: '700' },
  formRow: { display: 'flex', gap: '16px', marginBottom: '14px' },
  label: { display: 'block', color: '#475569', fontSize: '13px', fontWeight: '700', marginBottom: '6px' },
  input: {
    width: '100%', padding: '10px 14px',
    border: '1px solid rgba(148,163,184,0.22)', fontSize: '14px', boxSizing: 'border-box',
    outline: 'none', color: '#0f172a', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    background: '#fff', borderRadius: '14px'
  },
  submitBtn: {
    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    color: '#fff', border: 'none', padding: '10px 26px',
    borderRadius: '999px', cursor: 'pointer', fontWeight: '600', fontSize: '14px'
  },
  cancelBtn: {
    background: '#fff', color: '#475569', border: '1px solid rgba(148,163,184,0.22)',
    padding: '10px 20px', borderRadius: '999px', cursor: 'pointer',
    fontWeight: '600', fontSize: '14px'
  },
  successBanner: {
    background: '#ecfdf5', color: '#166534', border: '1px solid #bbf7d0',
    padding: '10px 16px', borderRadius: '14px', marginBottom: '16px', fontSize: '14px'
  },
  errorBanner: {
    background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3',
    padding: '10px 16px', borderRadius: '14px', marginBottom: '16px', fontSize: '14px'
  },
  tableWrapper: { background: 'rgba(255,255,255,0.86)', borderRadius: '20px', boxShadow: '0 12px 30px rgba(15,23,42,0.06)', overflow: 'hidden', border: '1px solid rgba(148,163,184,0.14)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableHeadRow: { background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' },
  th: { padding: '13px 16px', color: '#fff', textAlign: 'left', fontSize: '13px', fontWeight: '700' },
  tableRow: { borderBottom: '1px solid rgba(226,232,240,0.9)' },
  td: { padding: '12px 16px', fontSize: '14px', color: '#0f172a' },
  emptyCell: { padding: '32px', textAlign: 'center', color: '#64748b' },
  actionGroup: { display: 'flex', gap: '8px' },
  editBtn: {
    background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
    padding: '5px 12px', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: '600'
  },
  deleteBtn: {
    background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3',
    padding: '5px 12px', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: '600'
  },
  restoreBtn: {
    background: '#ecfdf5', color: '#166534', border: '1px solid #bbf7d0',
    padding: '5px 12px', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: '600'
  },
  activeBadge: {
    background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe',
    padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '600'
  },
  deletedBadge: {
    background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3',
    padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '600'
  },
  statusText: { color: '#64748b', textAlign: 'center', padding: '40px' }
};

export default AdminContentManager;
