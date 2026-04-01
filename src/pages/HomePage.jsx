import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';



function HomePage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    api.get('/courses')
      .then(res => {
        setCourses(res.data || []);
        setLoading(false);
      })
      .catch(err => {
        setError('Không thể tải danh sách khóa học');
        setLoading(false);
        console.error(err);
      });
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>🌏 AI Languages Learn</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.welcomeText}>Xin chào, <strong>{user.username}</strong>!</span>
          {user.role === 'admin' && (
            <button onClick={() => navigate('/admin/users')} style={styles.adminBtn}>
              ⚙️ Quản lý tài khoản
            </button>
          )}
          {user.role === 'admin' && (
            <button onClick={() => navigate('/admin/content')} style={styles.adminBtn}>
              📚 Quản lý nội dung
            </button>
          )}
          {user.role === 'teacher' && (
            <button onClick={() => navigate('/teacher/create-content')} style={styles.adminBtn}>
              ✍️ Tạo course/lesson/exercise
            </button>
          )}
          <button onClick={handleLogout} style={styles.logoutBtn}>
            🚪 Đăng xuất
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
        <h2 style={styles.sectionTitle}>📚 Danh sách khóa học</h2>
        <p style={styles.sectionDesc}>Chọn khóa học để vào trang kỹ năng nghe, nói, đọc, viết.</p>

        {loading && <p style={styles.statusText}>Đang tải...</p>}
        {error && <p style={styles.errorText}>{error}</p>}
        {!loading && !error && courses.length === 0 && (
          <p style={styles.statusText}>Chưa có khóa học nào.</p>
        )}

        <div style={styles.lessonGrid}>
          {courses.map(course => (
            <div
              key={course.id}
              style={styles.lessonCard}
              onClick={() => navigate(`/courses/${course.id}/skills`)}
            >
              <div style={styles.lessonOrder}>{String(course.level || 'Chưa có level').toUpperCase()}</div>
              <h3 style={styles.lessonTitle}>{course.name}</h3>
              {course.description && (
                <p style={styles.lessonContent}>{course.description.substring(0, 140)}...</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: { fontFamily: 'sans-serif', minHeight: '100vh', background: '#f5f6fa' },
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '16px 32px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#fff'
  },
  headerLeft: {},
  logo: { fontSize: '20px', fontWeight: 'bold' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '16px' },
  welcomeText: { fontSize: '14px' },
  logoutBtn: {
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.4)',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
  },
  adminBtn: {
    background: 'rgba(255,255,255,0.25)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.5)',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
  },
  content: { maxWidth: '900px', margin: '0 auto', padding: '32px 24px' },
  sectionTitle: { color: '#333', marginBottom: '8px' },
  sectionDesc: { color: '#888', marginBottom: '24px' },
  statusText: { color: '#888', textAlign: 'center', padding: '40px' },
  errorText: { color: '#e53e3e', textAlign: 'center', padding: '40px' },
  lessonGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '16px'
  },
  lessonCard: {
    background: '#fff',
    borderRadius: '10px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    cursor: 'pointer',
    transition: 'box-shadow 0.2s'
  },
  lessonOrder: {
    fontSize: '12px',
    color: '#667eea',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: '8px'
  },
  lessonTitle: { color: '#333', fontSize: '16px', marginBottom: '8px', fontWeight: '600' },
  lessonContent: { color: '#888', fontSize: '13px', lineHeight: '1.5' }
};

export default HomePage;