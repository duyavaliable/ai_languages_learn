import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

function RegisterAdminPage() {
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
      await api.post('/auth/register-admin', form);
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng ký admin thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Đăng ký Admin</h2>
        <p style={styles.subtitle}>Trang đăng ký dành cho quản trị viên</p>

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
            {loading ? 'Đang đăng ký...' : 'Đăng ký Admin'}
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
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(140deg, #7f1d1d 0%, #b91c1c 45%, #fb923c 100%)',
    fontFamily: 'sans-serif',
    padding: '20px'
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    background: '#ffffff',
    borderRadius: '14px',
    padding: '34px 30px',
    boxShadow: '0 14px 40px rgba(0,0,0,0.24)'
  },
  title: {
    margin: 0,
    textAlign: 'center',
    color: '#0f172a',
    fontSize: '26px'
  },
  subtitle: {
    textAlign: 'center',
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
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    padding: '11px 12px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box'
  },
  button: {
    width: '100%',
    marginTop: '8px',
    border: 'none',
    borderRadius: '8px',
    padding: '12px',
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '15px',
    cursor: 'pointer',
    background: 'linear-gradient(120deg, #b91c1c 0%, #f97316 100%)'
  },
  link: {
    textAlign: 'center',
    marginTop: '18px',
    marginBottom: 0,
    color: '#64748b'
  },
  linkText: {
    color: '#b91c1c',
    fontWeight: 700,
    textDecoration: 'none'
  }
};

export default RegisterAdminPage;