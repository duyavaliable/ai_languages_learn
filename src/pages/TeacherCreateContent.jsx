import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const SKILL_OPTIONS = [
  { value: 'reading', label: 'Đọc' },
  { value: 'listening', label: 'Nghe' },
  { value: 'writing', label: 'Viết' },
  { value: 'speaking', label: 'Nói' }
];

const defaultCourse = {
  language_id: '',
  name: '',
  description: '',
  level: 'A2',
  duration: ''
};

const defaultLesson = {
  course_id: '',
  title: '',
  content: '',
  lesson_order: 1
};

const defaultExercise = {
  course_id: '',
  title: '',
  skill: 'reading',
  cefrLevel: 'A2',
  topic: '',
  count: 5
};

const toCefrLevel = (value) => String(value || '').trim().toUpperCase();

function TeacherCreateContent() {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const [mode, setMode] = useState('course');

  const [languages, setLanguages] = useState([]);
  const [courses, setCourses] = useState([]);

  const [courseForm, setCourseForm] = useState(defaultCourse);
  const [lessonForm, setLessonForm] = useState(defaultLesson);
  const [exerciseForm, setExerciseForm] = useState(defaultExercise);

  const [message, setMessage] = useState(null);
  const [createdExerciseInfo, setCreatedExerciseInfo] = useState(null);
  const [listeningAudioFile, setListeningAudioFile] = useState(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [editFeedback, setEditFeedback] = useState('');
  const [refineLoading, setRefineLoading] = useState(false);

  useEffect(() => {
    if (currentUser.role !== 'teacher') {
      navigate('/');
      return;
    }

    api.get('/languages').then((res) => setLanguages(res.data)).catch(() => {});
    fetchCourses();
  }, []);

  const fetchCourses = () => {
    api.get('/courses').then((res) => setCourses(res.data)).catch(() => {});
  };

  const showMsg = (type, text) => setMessage({ type, text });

  const submitCourse = async (e) => {
    e.preventDefault();
    setMessage(null);
    try {
      await api.post('/courses/teacher-create', {
        ...courseForm,
        duration: courseForm.duration === '' ? null : Number(courseForm.duration)
      });
      setCourseForm(defaultCourse);
      fetchCourses();
      showMsg('success', 'Tạo course thành công');
    } catch (err) {
      showMsg('error', err.response?.data?.message || 'Tạo course thất bại');
    }
  };

  const submitLesson = async (e) => {
    e.preventDefault();
    setMessage(null);
    try {
      await api.post('/lessons/teacher-create', {
        ...lessonForm,
        lesson_order: Number(lessonForm.lesson_order || 1)
      });
      setLessonForm((prev) => ({ ...defaultLesson, course_id: prev.course_id }));
      showMsg('success', 'Tạo chủ đề thành công');
    } catch (err) {
      showMsg('error', err.response?.data?.message || 'Tạo chủ đề thất bại');
    }
  };

  const submitExercise = async (e) => {
    e.preventDefault();
    setMessage(null);
    setGenerateLoading(true);
    try {
      const formData = new FormData();
      formData.append('course_id', String(Number(exerciseForm.course_id)));
      formData.append('exerciseTitle', exerciseForm.title || '');
      formData.append('skill', exerciseForm.skill);
      formData.append('cefrLevel', exerciseForm.cefrLevel);
      formData.append('topic', exerciseForm.topic || '');
      formData.append('count', String(Number(exerciseForm.count || 5)));

      if (exerciseForm.skill === 'listening') {
        if (!listeningAudioFile) {
          showMsg('error', 'Vui lòng tải file audio cho bài nghe.');
          return;
        }
        formData.append('audioFile', listeningAudioFile);
      }

      const res = await api.post('/ai/teacher/generate-exercises', formData, {
        timeout: 90000
      });
      setCreatedExerciseInfo({
        exerciseId: res.data?.exerciseId,
        exerciseTitle: res.data?.exerciseTitle,
        audioUrl: res.data?.audioUrl || null,
        exerciseSet: res.data?.exerciseSet || null,
        skill: exerciseForm.skill,
        questionCount: Array.isArray(res.data?.exerciseSet?.questions) ? res.data.exerciseSet.questions.length : 0
      });
      setListeningAudioFile(null);
      setEditFeedback('');
      showMsg('success', `AI đã tạo và lưu ${res.data?.savedExercises || 0} bài tập vào kho bài tập.`);
    } catch (err) {
      const detail = err?.response?.data?.message || err?.message || 'Tạo exercise thất bại';
      console.error('[TeacherCreateContent] Exercise generation failed', {
        request: {
          course_id: Number(exerciseForm.course_id),
          exerciseTitle: exerciseForm.title,
          skill: exerciseForm.skill,
          cefrLevel: exerciseForm.cefrLevel,
          topic: exerciseForm.topic,
          count: Number(exerciseForm.count || 5)
        },
        status: err?.response?.status,
        data: err?.response?.data,
        message: detail
      });

      if (err?.code === 'ECONNABORTED') {
        showMsg('error', 'Tạo exercise thất bại do quá thời gian chờ (timeout). Kiểm tra terminal backend để xem AI có còn đang xử lý không.');
      } else {
        showMsg('error', 'Tạo exercise thất bại. Xem terminal để biết chi tiết lỗi.');
      }
    } finally {
      setGenerateLoading(false);
    }
  };

  const refineExercise = async () => {
    if (!createdExerciseInfo?.exerciseId) return;
    if (!editFeedback.trim()) {
      showMsg('error', 'Vui lòng nhập yêu cầu chỉnh sửa cho AI.');
      return;
    }

    try {
      setRefineLoading(true);
      const res = await api.post('/ai/teacher/refine-exercise', {
        exerciseId: createdExerciseInfo.exerciseId,
        feedback: editFeedback
      });

      setCreatedExerciseInfo((prev) => ({
        ...prev,
        exerciseSet: res.data?.exerciseSet || prev?.exerciseSet,
        exerciseTitle: res.data?.exerciseTitle || prev?.exerciseTitle,
        questionCount: Array.isArray(res.data?.exerciseSet?.questions) ? res.data.exerciseSet.questions.length : prev?.questionCount
      }));
      setEditFeedback('');
      showMsg('success', 'AI đã chỉnh sửa bài theo yêu cầu của giáo viên.');
    } catch (err) {
      showMsg('error', err.response?.data?.message || 'Không thể chỉnh sửa bài bằng AI');
    } finally {
      setRefineLoading(false);
    }
  };

  const resetExerciseDraft = () => {
    setCreatedExerciseInfo(null);
    setEditFeedback('');
    setListeningAudioFile(null);
    setExerciseForm(defaultExercise);
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button onClick={() => navigate('/')} style={styles.backBtn}>← Quay lại</button>
          <span style={styles.logo}>🧑‍🏫 Teacher Content Creator</span>
        </div>
        <span style={styles.welcomeText}>Giáo viên: <strong>{currentUser.username}</strong></span>
      </div>

      <div style={styles.content}>
        {message && <div style={message.type === 'success' ? styles.successBanner : styles.errorBanner}>{message.text}</div>}

        <div style={styles.modeBar}>
          <button
            onClick={() => setMode('course')}
            style={mode === 'course' ? styles.modeBtnActive : styles.modeBtn}
          >
            Tạo Course
          </button>
          <button
            onClick={() => setMode('lesson')}
            style={mode === 'lesson' ? styles.modeBtnActive : styles.modeBtn}
          >
            Tạo Chủ đề từ vựng
          </button>
          <button
            onClick={() => setMode('exercise')}
            style={mode === 'exercise' ? styles.modeBtnActive : styles.modeBtn}
          >
            Tạo Exercise
          </button>
        </div>

        {mode === 'course' && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Tạo Course</h3>
            <form onSubmit={submitCourse}>
              <label style={styles.label}>Tên course</label>
              <input style={styles.input} value={courseForm.name} onChange={(e) => setCourseForm((p) => ({ ...p, name: e.target.value }))} required />

              <label style={styles.label}>Ngôn ngữ</label>
              <select style={styles.input} value={courseForm.language_id} onChange={(e) => setCourseForm((p) => ({ ...p, language_id: e.target.value }))} required>
                <option value="">-- Chọn ngôn ngữ --</option>
                {languages.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
              </select>

              <label style={styles.label}>Level</label>
              <select style={styles.input} value={courseForm.level} onChange={(e) => setCourseForm((p) => ({ ...p, level: e.target.value }))}>
                {CEFR_LEVELS.map((lv) => (
                  <option key={lv} value={lv}>{lv}</option>
                ))}
              </select>

              <label style={styles.label}>Duration (hours)</label>
              <input type="number" style={styles.input} value={courseForm.duration} onChange={(e) => setCourseForm((p) => ({ ...p, duration: e.target.value }))} />

              <label style={styles.label}>Mô tả</label>
              <textarea style={{ ...styles.input, height: '80px', resize: 'vertical' }} value={courseForm.description} onChange={(e) => setCourseForm((p) => ({ ...p, description: e.target.value }))} />

              <button type="submit" style={styles.submitBtn}>Tạo Course</button>
            </form>
          </div>
        )}

        {mode === 'lesson' && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Tạo Chủ đề từ vựng</h3>
            <form onSubmit={submitLesson}>
              <label style={styles.label}>Course</label>
              <select style={styles.input} value={lessonForm.course_id} onChange={(e) => setLessonForm((p) => ({ ...p, course_id: e.target.value }))} required>
                <option value="">-- Chọn course --</option>
                {courses.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>

              <label style={styles.label}>Tên chủ đề</label>
              <input style={styles.input} value={lessonForm.title} onChange={(e) => setLessonForm((p) => ({ ...p, title: e.target.value }))} required />

              <label style={styles.label}>Thứ tự</label>
              <input type="number" min="1" style={styles.input} value={lessonForm.lesson_order} onChange={(e) => setLessonForm((p) => ({ ...p, lesson_order: e.target.value }))} />

              <label style={styles.label}>Nội dung</label>
              <textarea style={{ ...styles.input, height: '80px', resize: 'vertical' }} value={lessonForm.content} onChange={(e) => setLessonForm((p) => ({ ...p, content: e.target.value }))} />

              <button type="submit" style={styles.submitBtn}>Tạo Chủ đề</button>
            </form>
          </div>
        )}

        {mode === 'exercise' && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Tạo Exercise (AI)</h3>
            <p style={styles.hintText}>Giáo viên chọn khóa học, kỹ năng, trình độ và số câu. AI sẽ tạo bài tương ứng.</p>
            {generateLoading && (
              <div style={styles.loadingBanner}>
                <span style={styles.loadingDot} />
                AI đang tạo bài, vui lòng chờ...
              </div>
            )}
            <form onSubmit={submitExercise} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
              <div>
                <label style={styles.label}>Khóa học</label>
                <select
                  style={styles.input}
                  value={exerciseForm.course_id}
                  onChange={(e) => {
                    const courseId = e.target.value;
                    const selectedCourse = courses.find((course) => String(course.id) === String(courseId));
                    const level = toCefrLevel(selectedCourse?.level);
                    setExerciseForm((p) => ({
                      ...p,
                      course_id: courseId,
                      cefrLevel: CEFR_LEVELS.includes(level) ? level : p.cefrLevel
                    }));
                  }}
                  required
                >
                  <option value="">-- Chọn khóa --</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name} ({String(course.level || '').toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={styles.label}>Kỹ năng</label>
                <select
                  style={styles.input}
                  value={exerciseForm.skill}
                  onChange={(e) => {
                    const nextSkill = e.target.value;
                    setExerciseForm((p) => ({
                      ...p,
                      skill: nextSkill,
                      count: nextSkill === 'writing' || nextSkill === 'speaking' ? 0 : (p.count || 5)
                    }));
                    if (nextSkill !== 'listening') {
                      setListeningAudioFile(null);
                    }
                  }}
                >
                  {SKILL_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={styles.label}>Trình độ</label>
                <select
                  style={styles.input}
                  value={exerciseForm.cefrLevel}
                  onChange={(e) => setExerciseForm((p) => ({ ...p, cefrLevel: e.target.value }))}
                >
                  {CEFR_LEVELS.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={styles.label}>Số câu</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  disabled={exerciseForm.skill === 'writing' || exerciseForm.skill === 'speaking'}
                  style={styles.input}
                  value={exerciseForm.count}
                  onChange={(e) => setExerciseForm((p) => ({ ...p, count: e.target.value }))}
                />
              </div>
              <button
                type="submit"
                style={styles.submitBtn}
                disabled={generateLoading || (exerciseForm.skill === 'listening' && !listeningAudioFile)}
              >
                {generateLoading ? 'Đang tạo...' : 'Tạo bằng AI'}
              </button>
            </form>

            <div style={{ marginTop: '8px' }}>
              <label style={styles.label}>Tên bài</label>
              <input
                style={styles.input}
                placeholder="Ví dụ: Bài 1 - Reading Environment"
                value={exerciseForm.title}
                onChange={(e) => setExerciseForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>

            <div style={{ marginTop: '12px' }}>
              <label style={styles.label}>Chủ đề phụ (không bắt buộc)</label>
              <input
                style={styles.input}
                placeholder="Ví dụ: travel, business email, daily conversation..."
                value={exerciseForm.topic}
                onChange={(e) => setExerciseForm((p) => ({ ...p, topic: e.target.value }))}
              />
            </div>

            {exerciseForm.skill === 'listening' && (
              <div style={{ marginTop: '12px' }}>
                <label style={styles.label}>File nghe (mp3, wav, m4a, webm, ogg)</label>
                <input
                  type="file"
                  accept="audio/*"
                  style={styles.input}
                  onChange={(e) => setListeningAudioFile(e.target.files?.[0] || null)}
                />
                {listeningAudioFile && (
                  <div style={styles.helperText}>Đã chọn: {listeningAudioFile.name}</div>
                )}
                {!listeningAudioFile && <div style={styles.helperText}>Bạn cần tải file audio để AI tạo bài nghe.</div>}
              </div>
            )}

            {createdExerciseInfo && (
              <div style={{ marginTop: '16px' }}>
                <div style={styles.exerciseCard}>
                  <div style={styles.exerciseQuestion}>Đã tạo: {createdExerciseInfo.exerciseTitle}</div>
                  <div style={styles.answer}>Số câu: {createdExerciseInfo.questionCount}</div>
                  {createdExerciseInfo.exerciseSet?.taskPrompt && (
                    <div style={styles.previewBlock}>
                      <strong>Đề bài:</strong>
                      <div style={styles.previewText}>{createdExerciseInfo.exerciseSet.taskPrompt}</div>
                    </div>
                  )}
                  {createdExerciseInfo.exerciseSet?.readingPassage && (
                    <div style={styles.previewBlock}>
                      <strong>Bài đọc:</strong>
                      <div style={styles.previewText}>{createdExerciseInfo.exerciseSet.readingPassage}</div>
                    </div>
                  )}
                  {createdExerciseInfo.audioUrl && (
                    <div style={styles.previewBlock}>
                      <strong>Audio:</strong>
                      <audio controls style={{ width: '100%', marginTop: '8px' }} src={createdExerciseInfo.audioUrl} />
                    </div>
                  )}
                  {Array.isArray(createdExerciseInfo.exerciseSet?.questions) && createdExerciseInfo.exerciseSet.questions.length > 0 && (
                    <div style={styles.previewBlock}>
                      <strong>Danh sách câu hỏi:</strong>
                      {createdExerciseInfo.exerciseSet.questions.map((q, idx) => (
                        <div key={idx} style={styles.questionPreviewCard}>
                          <div style={styles.exerciseQuestion}>{idx + 1}. {q.question}</div>
                          <div style={styles.optionPreviewGrid}>
                            {(q.options || []).map((opt, i) => (
                              <div key={i} style={styles.optionPreviewItem}>{String.fromCharCode(65 + i)}. {opt}</div>
                            ))}
                          </div>
                          <div style={styles.answer}>Đáp án: {q.correctAnswer}</div>
                          {q.explanation && <div style={styles.explainText}>Gợi ý: {q.explanation}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                  {createdExerciseInfo.exerciseSet?.sampleAnswer && (
                    <div style={styles.previewBlock}>
                      <strong>Bài mẫu:</strong>
                      <div style={styles.previewText}>{createdExerciseInfo.exerciseSet.sampleAnswer}</div>
                    </div>
                  )}

                  <div style={{ marginTop: '14px' }}>
                    <label style={styles.label}>Khung chat chỉnh sửa với AI</label>
                    <textarea
                      style={{ ...styles.input, height: '90px', resize: 'vertical' }}
                      placeholder="Ví dụ: Hãy làm câu 2 dễ hơn, thêm 1 câu hỏi, đổi từ vựng sang chủ đề technology..."
                      value={editFeedback}
                      onChange={(e) => setEditFeedback(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                      <button type="button" onClick={refineExercise} style={styles.submitBtn} disabled={refineLoading || generateLoading}>
                        {refineLoading ? 'Đang chỉnh sửa...' : generateLoading ? 'Đang tạo bài...' : 'Chỉnh sửa bằng AI'}
                      </button>
                      <button type="button" onClick={resetExerciseDraft} style={styles.cancelBtn}>
                        Tạo bài mới
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: '10px' }}>
                    <button type="button" style={styles.secondaryPreviewBtn} onClick={() => navigate(`/courses/${exerciseForm.course_id}/skills/${exerciseForm.skill}/exercises`)}>
                      Xem danh sách bài
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrapper: { fontFamily: 'sans-serif', minHeight: '100vh', background: '#f5f6fa' },
  header: {
    background: 'linear-gradient(135deg, #1f7a8c 0%, #2c5f8a 100%)',
    padding: '16px 32px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#fff'
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  backBtn: {
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.4)',
    padding: '7px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
  },
  logo: { fontSize: '20px', fontWeight: 'bold' },
  welcomeText: { fontSize: '14px' },
  content: { maxWidth: '1100px', margin: '0 auto', padding: '28px 24px' },
  modeBar: { display: 'flex', gap: '10px', marginBottom: '16px' },
  modeBtn: {
    background: '#edf2f7',
    color: '#4a5568',
    border: '1px solid #cbd5e0',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px'
  },
  modeBtnActive: {
    background: 'linear-gradient(135deg, #1f7a8c 0%, #2c5f8a 100%)',
    color: '#fff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px'
  },
  card: {
    background: '#fff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)'
  },
  cardTitle: { marginTop: 0, marginBottom: '14px', color: '#234' },
  hintText: { marginTop: 0, marginBottom: '14px', color: '#4a5568', fontSize: '14px' },
  loadingBanner: {
    marginBottom: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #bfdbfe',
    background: '#eff6ff',
    color: '#1e3a8a',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontWeight: '600'
  },
  loadingDot: {
    width: '10px',
    height: '10px',
    borderRadius: '999px',
    background: '#2563eb'
  },
  label: { display: 'block', marginBottom: '6px', color: '#555', fontSize: '13px', fontWeight: '600' },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    marginBottom: '12px',
    boxSizing: 'border-box',
    fontSize: '14px'
  },
  submitBtn: {
    background: 'linear-gradient(135deg, #1f7a8c 0%, #2c5f8a 100%)',
    color: '#fff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px'
  },
  successBanner: {
    background: '#f0fff4',
    color: '#276749',
    border: '1px solid #c6f6d5',
    padding: '10px 16px',
    borderRadius: '8px',
    marginBottom: '16px'
  },
  errorBanner: {
    background: '#fff5f5',
    color: '#c53030',
    border: '1px solid #fed7d7',
    padding: '10px 16px',
    borderRadius: '8px',
    marginBottom: '16px'
  },
  exerciseCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '12px',
    marginBottom: '10px',
    background: '#fafcff'
  },
  exerciseQuestion: { fontWeight: '600', color: '#2d3748' },
  options: { margin: '8px 0', paddingLeft: '20px', color: '#4a5568' },
  answer: { color: '#1f7a8c', fontWeight: '600' },
  previewBlock: {
    marginTop: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #dbeafe',
    background: '#f8fbff'
  },
  previewText: { whiteSpace: 'pre-wrap', color: '#334155', marginTop: '6px', lineHeight: 1.5 },
  questionPreviewCard: {
    marginTop: '10px',
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    background: '#fff'
  },
  optionPreviewGrid: { display: 'grid', gap: '6px', marginTop: '8px' },
  optionPreviewItem: { padding: '8px 10px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155' },
  explainText: { marginTop: '8px', color: '#0f766e', fontStyle: 'italic' },
  helperText: { color: '#b45309', marginTop: '8px', fontSize: '13px' },
  secondaryPreviewBtn: {
    border: '1px solid #1f7a8c',
    background: '#f8fbff',
    color: '#1f7a8c',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px'
  },
  cancelBtn: {
    border: '1px solid #cbd5e1',
    background: '#fff',
    color: '#334155',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px'
  }
};

export default TeacherCreateContent;
