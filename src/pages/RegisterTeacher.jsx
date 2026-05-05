import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

function RegisterTeacherPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/register-teacher', form);
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng ký teacher thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.brandPanel}>
        <div style={styles.brandBadge}>Teacher workspace</div>
        <h1 style={styles.brandTitle}>Đăng ký tài khoản giáo viên</h1>
        <p style={styles.brandText}>
          Tạo tài khoản để vào không gian làm việc riêng cho teacher, nơi bạn có thể tạo vocabulary và exercise theo course.
        </p>
      </div>
      <div style={styles.card}>
        <h2 style={styles.title}>Đăng ký Teacher</h2>
        <p style={styles.subtitle}>Một bước để vào dashboard dành cho giáo viên.</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Tên người dùng</label>
            <input
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              placeholder="Nhập tên người dùng"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="Nhập email"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Mật khẩu</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Nhập mật khẩu"
              style={styles.input}
              required
            />
          </div>

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Đang đăng ký...' : 'Đăng ký Teacher'}
          </button>
        </form>

        <p style={styles.link}>
          Đã có tài khoản?{' '}
          <Link to="/login" style={styles.linkText}>Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '24px',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at top left, rgba(15, 118, 110, 0.16), transparent 28%), linear-gradient(180deg, #eef4fb 0%, #f7f9fc 55%, #edf2f8 100%)',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    padding: '28px'
  },
  brandPanel: {
    flex: '1 1 480px',
    maxWidth: '560px',
    padding: '20px 12px'
  },
  brandBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '999px',
    border: '1px solid rgba(37, 99, 235, 0.18)',
    background: 'rgba(255,255,255,0.8)',
    color: '#1d4ed8',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase'
  },
  brandTitle: {
    margin: '18px 0 12px',
    fontSize: '44px',
    lineHeight: 1.06,
    color: '#0f172a',
    letterSpacing: '-0.04em'
  },
  brandText: {
    margin: 0,
    color: '#475569',
    fontSize: '16px',
    lineHeight: 1.8,
    maxWidth: '46ch'
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    flex: '0 1 420px',
    background: 'rgba(255,255,255,0.9)',
    borderRadius: '24px',
    padding: '34px 30px',
    boxShadow: '0 22px 44px rgba(15,23,42,0.08)',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    backdropFilter: 'blur(12px)',
  },
  title: {
    margin: 0,
    textAlign: 'left',
    color: '#0f172a',
    fontSize: '26px',
    letterSpacing: '-0.03em'
  },
  subtitle: {
    textAlign: 'left',
    color: '#64748b',
    marginTop: '8px',
    marginBottom: '24px'
  },
  error: {
    background: '#fff1f2',
    color: '#b91c1c',
    border: '1px solid #fecdd3',
    borderRadius: '8px',
    padding: '10px 12px',
    marginBottom: '14px',
    fontSize: '14px'
  },
  formGroup: {
    marginBottom: '14px'
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    color: '#334155',
    fontWeight: 600,
    fontSize: '14px'
  },
  input: {
    width: '100%',
    border: '1px solid #d6dee9',
    borderRadius: '12px',
    padding: '11px 12px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    background: '#fff',
    color: '#0f172a'
  },
  button: {
    width: '100%',
    marginTop: '8px',
    border: 'none',
    borderRadius: '12px',
    padding: '12px',
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '15px',
    cursor: 'pointer',
    background: 'linear-gradient(120deg, #0f766e 0%, #2563eb 100%)'
  },
  link: {
    textAlign: 'center',
    marginTop: '18px',
    marginBottom: 0,
    color: '#64748b'
  },
  linkText: {
    color: '#0f766e',
    fontWeight: 700,
    textDecoration: 'none'
  }
};

export default RegisterTeacherPage;