import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
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
      await api.post('/auth/register', {
        username: form.username,
        email: form.email,
        password: form.password
      });
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng ký thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>🌏 Đăng ký</h2>
        <p style={styles.subtitle}>Tạo tài khoản để bắt đầu học!</p>

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
              placeholder="Nhập email của bạn"
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
            {loading ? 'Đang đăng ký...' : 'Đăng ký'}
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
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    fontFamily: 'sans-serif'
  },
  card: {
    background: '#fff',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
    width: '100%',
    maxWidth: '400px'
  },
  title: {
    textAlign: 'center',
    marginBottom: '8px',
    color: '#333',
    fontSize: '24px'
  },
  subtitle: {
    textAlign: 'center',
    color: '#888',
    marginBottom: '24px'
  },
  error: {
    background: '#fff0f0',
    color: '#e53e3e',
    padding: '10px 14px',
    borderRadius: '6px',
    marginBottom: '16px',
    border: '1px solid #fed7d7',
    fontSize: '14px'
  },
  formGroup: { marginBottom: '16px' },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontWeight: '600',
    color: '#555',
    fontSize: '14px'
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box'
  },
  button: {
    width: '100%',
    padding: '12px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '8px'
  },
  link: {
    textAlign: 'center',
    marginTop: '20px',
    color: '#888',
    fontSize: '14px'
  },
  linkText: {
    color: '#667eea',
    fontWeight: '600',
    textDecoration: 'none'
  }
};

export default RegisterPage;