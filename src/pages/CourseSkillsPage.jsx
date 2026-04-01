import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';

const SKILLS = [
  { id: 'listening', label: 'Nghe', icon: '🎧' },
  { id: 'speaking', label: 'Nói', icon: '🗣️' },
  { id: 'reading', label: 'Đọc', icon: '📖' },
  { id: 'writing', label: 'Viết', icon: '✍️' }
];

function CourseSkillsPage() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/courses/${courseId}`)
      .then((res) => {
        setCourse(res.data);
        setLoading(false);
      })
      .catch(() => {
        setError('Không tải được khóa học');
        setLoading(false);
      });
  }, [courseId]);

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <button onClick={() => navigate('/')} style={styles.backBtn}>← Về trang chủ</button>
        <h2 style={styles.title}>Kỹ năng của khóa học</h2>
      </div>

      <div style={styles.content}>
        {loading && <p style={styles.statusText}>Đang tải...</p>}
        {error && <p style={styles.errorText}>{error}</p>}
        {!loading && !error && course && (
          <>
            <div style={styles.courseCard}>
              <h3 style={styles.courseName}>{course.name}</h3>
              <p style={styles.courseMeta}>Trình độ: {String(course.level || '').toUpperCase()} | Ngôn ngữ: {course.language?.name || 'Tiếng Anh'}</p>
              {course.description && <p style={styles.courseDesc}>{course.description}</p>}
            </div>

            <div style={styles.skillGrid}>
              {SKILLS.map((skill) => (
                <button
                  key={skill.id}
                  style={styles.skillCard}
                  onClick={() => navigate(`/courses/${courseId}/skills/${skill.id}/exercises`)}
                >
                  <span style={styles.skillIcon}>{skill.icon}</span>
                  <span style={styles.skillText}>{skill.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrapper: { minHeight: '100vh', background: '#f5f6fa', fontFamily: 'sans-serif' },
  header: {
    background: '#1f7a8c',
    color: '#fff',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  backBtn: {
    border: '1px solid rgba(255,255,255,0.4)',
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    padding: '8px 14px',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  title: { margin: 0 },
  content: { maxWidth: '980px', margin: '0 auto', padding: '24px' },
  courseCard: {
    background: '#fff',
    borderRadius: '12px',
    padding: '18px',
    marginBottom: '18px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
  },
  courseName: { margin: '0 0 8px 0', color: '#123' },
  courseMeta: { margin: '0 0 8px 0', color: '#667' },
  courseDesc: { margin: 0, color: '#556' },
  skillGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
    gap: '14px'
  },
  skillCard: {
    border: 'none',
    borderRadius: '12px',
    background: '#fff',
    minHeight: '120px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    cursor: 'pointer',
    fontSize: '18px',
    fontWeight: '700',
    color: '#1f7a8c',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px'
  },
  skillIcon: { fontSize: '28px' },
  skillText: {},
  statusText: { color: '#667', textAlign: 'center', padding: '40px' },
  errorText: { color: '#c53030', textAlign: 'center', padding: '40px' }
};

export default CourseSkillsPage;
