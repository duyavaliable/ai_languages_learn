import { Link } from 'react-router-dom';

function UnauthorizedPage() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.badge}>403</div>
        <h1 style={styles.title}>Bạn không có quyền truy cập</h1>
        <p style={styles.text}>
          Tài khoản {user.role ? `với vai trò ${user.role}` : 'hiện tại'} không thể mở trang này.
        </p>
        <div style={styles.actions}>
          <Link to="/" style={styles.primaryButton}>Về trang chủ</Link>
          <Link to="/login" style={styles.secondaryButton}>Đăng nhập lại</Link>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
    padding: '24px',
    fontFamily: 'sans-serif'
  },
  card: {
    width: '100%',
    maxWidth: '520px',
    background: '#fff',
    borderRadius: '20px',
    padding: '32px',
    boxShadow: '0 20px 60px rgba(15, 23, 42, 0.12)',
    border: '1px solid #e2e8f0',
    textAlign: 'center'
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '72px',
    padding: '8px 14px',
    borderRadius: '999px',
    background: '#fee2e2',
    color: '#b91c1c',
    fontWeight: '700',
    marginBottom: '16px'
  },
  title: {
    margin: '0 0 12px',
    fontSize: '28px',
    color: '#0f172a'
  },
  text: {
    margin: '0 0 24px',
    color: '#475569',
    lineHeight: 1.6
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    flexWrap: 'wrap'
  },
  primaryButton: {
    padding: '12px 18px',
    borderRadius: '10px',
    background: '#1d4ed8',
    color: '#fff',
    textDecoration: 'none',
    fontWeight: '600'
  },
  secondaryButton: {
    padding: '12px 18px',
    borderRadius: '10px',
    background: '#e2e8f0',
    color: '#0f172a',
    textDecoration: 'none',
    fontWeight: '600'
  }
};

export default UnauthorizedPage;