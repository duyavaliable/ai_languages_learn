import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';

const SKILL_LABEL = {
  listening: 'Nghe',
  speaking: 'Nói',
  reading: 'Đọc',
  writing: 'Viết'
};

function SkillExercisesPage() {
  const navigate = useNavigate();
  const { courseId, skill } = useParams();

  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get(`/courses/${courseId}`),
      api.get(`/lessons?courseId=${courseId}&skill=${skill}&exerciseOnly=true`)
    ])
      .then(([courseRes, lessonsRes]) => {
        setCourse(courseRes.data);
        setLessons(lessonsRes.data || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Không tải được danh sách bài tập');
        setLoading(false);
      });
  }, [courseId, skill]);

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <button onClick={() => navigate(`/courses/${courseId}/skills`)} style={styles.backBtn}>← Chọn kỹ năng khác</button>
        <h2 style={styles.title}>Bài tập kỹ năng {SKILL_LABEL[skill] || skill}</h2>
      </div>

      <div style={styles.content}>
        {loading && <p style={styles.statusText}>Đang tải...</p>}
        {error && <p style={styles.errorText}>{error}</p>}

        {!loading && !error && (
          <>
            <div style={styles.infoCard}>
              <div><strong>Khóa học:</strong> {course?.name}</div>
              <div><strong>Trình độ:</strong> {String(course?.level || '').toUpperCase()}</div>
              <div><strong>Kỹ năng:</strong> {SKILL_LABEL[skill] || skill}</div>
            </div>

            {lessons.length === 0 && (
              <p style={styles.statusText}>Chưa có bài tập nào cho kỹ năng này. Giáo viên có thể tạo trong mục Tạo Exercise (AI).</p>
            )}

            {lessons.map((lesson, idx) => (
              <div key={lesson.id} style={styles.exerciseCard}>
                <h3 style={styles.question}>{idx + 1}. {lesson.title}</h3>
                <div style={styles.answer}>Nhấn làm bài để bắt đầu giao diện thi trắc nghiệm.</div>
                <button
                  style={styles.startBtn}
                  onClick={() => navigate(`/courses/${courseId}/skills/${skill}/exercises/${lesson.id}`)}
                >
                  Làm bài
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrapper: { minHeight: '100vh', background: '#f5f6fa', fontFamily: 'sans-serif' },
  header: {
    background: '#2c5f8a',
    color: '#fff',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  backBtn: {
    border: '1px solid rgba(255,255,255,0.45)',
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    padding: '8px 14px',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  title: { margin: 0 },
  content: { maxWidth: '980px', margin: '0 auto', padding: '24px' },
  infoCard: {
    display: 'flex',
    gap: '18px',
    flexWrap: 'wrap',
    background: '#fff',
    borderRadius: '10px',
    padding: '14px 18px',
    marginBottom: '14px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
  },
  exerciseCard: {
    background: '#fff',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
  },
  question: { marginTop: 0, color: '#1a365d' },
  answer: { color: '#1f7a8c', marginTop: '8px' },
  startBtn: {
    marginTop: '10px',
    border: 'none',
    background: '#2c5f8a',
    color: '#fff',
    borderRadius: '8px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontWeight: '600'
  },
  statusText: { color: '#667', textAlign: 'center', padding: '24px' },
  errorText: { color: '#c53030', textAlign: 'center', padding: '24px' }
};

export default SkillExercisesPage;
