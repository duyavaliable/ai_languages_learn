import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const ROLES = ['student', 'teacher', 'admin'];

function AdminAccountManager() {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', email: '', password: '', role: 'student' });
  const [createError, setCreateError] = useState(null);
  const [createSuccess, setCreateSuccess] = useState(null);

  const [actionMsg, setActionMsg] = useState(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedUsers, setDeletedUsers] = useState([]);
  const [deletedLoading, setDeletedLoading] = useState(false);

  const fetchUsers = () => {
    setLoading(true);
    setFetchError(null);
    api.get('/users')
      .then(res => {
        setUsers(res.data);
        setLoading(false);
      })
      .catch(() => {
        setFetchError('Không thể tải danh sách tài khoản');
        setLoading(false);
      });
  };

  useEffect(() => {
    if (currentUser.role !== 'admin') {
      navigate('/');
      return;
    }
    fetchUsers();
  }, []);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);
    try {
      await api.post('/users', createForm);
      setCreateSuccess('Tạo tài khoản thành công!');
      setCreateForm({ username: '', email: '', password: '', role: 'student' });
      fetchUsers();
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Tạo tài khoản thất bại');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    setActionMsg(null);
    try {
      const res = await api.patch(`/users/${userId}/role`, { role: newRole });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: res.data.role } : u));
      setActionMsg({ type: 'success', text: 'Cập nhật vai trò thành công' });
    } catch (err) {
      setActionMsg({ type: 'error', text: err.response?.data?.message || 'Cập nhật vai trò thất bại' });
    }
  };

  const handleToggleLock = async (userId) => {
    setActionMsg(null);
    try {
      const res = await api.patch(`/users/${userId}/toggle-lock`);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: res.data.is_active } : u));
      setActionMsg({ type: 'success', text: `Tài khoản đã ${res.data.is_active ? 'mở khóa' : 'khóa'} thành công` });
    } catch (err) {
      setActionMsg({ type: 'error', text: err.response?.data?.message || 'Thao tác thất bại' });
    }
  };

  const fetchDeletedUsers = () => {
    setDeletedLoading(true);
    api.get('/users/deleted')
      .then(res => {
        setDeletedUsers(res.data);
        setDeletedLoading(false);
      })
      .catch(() => setDeletedLoading(false));
  };

  const handleToggleDeletedList = () => {
    const next = !showDeleted;
    setShowDeleted(next);
    if (next) fetchDeletedUsers();
  };

  const handleRestore = async (userId, username) => {
    setActionMsg(null);
    try {
      await api.patch(`/users/${userId}/restore`);
      setDeletedUsers(prev => prev.filter(u => u.id !== userId));
      fetchUsers();
      setActionMsg({ type: 'success', text: `Đã khôi phục tài khoản "${username}"` });
    } catch (err) {
      setActionMsg({ type: 'error', text: err.response?.data?.message || 'Khôi phục thất bại' });
    }
  };

  const handleSoftDelete = async (userId, username) => {
    if (!window.confirm(`Xóa tài khoản "${username}"? Tài khoản sẽ bị ẩn khỏi danh sách nhưng vẫn còn trong cơ sở dữ liệu.`)) return;
    setActionMsg(null);
    try {
      await api.delete(`/users/${userId}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
      setActionMsg({ type: 'success', text: `Đã xóa tài khoản "${username}"` });
    } catch (err) {
      setActionMsg({ type: 'error', text: err.response?.data?.message || 'Xóa tài khoản thất bại' });
    }
  };

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button onClick={() => navigate('/')} style={styles.backBtn}>← Quay lại</button>
          <span style={styles.logo}>👥 Quản lý tài khoản</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.welcomeText}>
            Admin: <strong>{currentUser.username}</strong>
          </span>
        </div>
      </div>

      <div style={styles.content}>
        {/* Top bar */}
        <div style={styles.topBar}>
          <h2 style={styles.sectionTitle}>Danh sách tài khoản ({users.length})</h2>
          <button
            onClick={() => { setShowCreateForm(!showCreateForm); setCreateError(null); setCreateSuccess(null); }}
            style={styles.createBtn}
          >
            {showCreateForm ? '✕ Đóng form' : '+ Tạo tài khoản'}
          </button>
        </div>

        {/* Create User Form */}
        {showCreateForm && (
          <div style={styles.createCard}>
            <h3 style={styles.createTitle}>Tạo tài khoản mới</h3>
            {createError && <p style={styles.errorText}>{createError}</p>}
            {createSuccess && <p style={styles.successText}>{createSuccess}</p>}
            <form onSubmit={handleCreateSubmit}>
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Tên đăng nhập</label>
                  <input
                    style={styles.input}
                    value={createForm.username}
                    onChange={e => setCreateForm(p => ({ ...p, username: e.target.value }))}
                    placeholder="Nhập tên đăng nhập"
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Email</label>
                  <input
                    style={styles.input}
                    type="email"
                    value={createForm.email}
                    onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="Nhập email"
                    required
                  />
                </div>
              </div>
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Mật khẩu</label>
                  <input
                    style={styles.input}
                    type="password"
                    value={createForm.password}
                    onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Nhập mật khẩu"
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Vai trò</label>
                  <select
                    style={styles.input}
                    value={createForm.role}
                    onChange={e => setCreateForm(p => ({ ...p, role: e.target.value }))}
                  >
                    {ROLES.map(r => (
                      <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button type="submit" style={styles.submitBtn}>Tạo tài khoản</button>
            </form>
          </div>
        )}

        {/* Deleted Users Toggle */}
        <div style={styles.deletedSection}>
          <button onClick={handleToggleDeletedList} style={styles.deletedToggleBtn}>
            {showDeleted ? '▲ Ẩn danh sách đã xóa' : '▼ Xem danh sách đã xóa mềm'}
            {!showDeleted && deletedUsers.length === 0 ? '' : ` (${deletedUsers.length})`}
          </button>

          {showDeleted && (
            <div style={{ marginTop: '12px' }}>
              {deletedLoading && <p style={styles.statusText}>Đang tải...</p>}
              {!deletedLoading && deletedUsers.length === 0 && (
                <p style={{ ...styles.statusText, padding: '16px', textAlign: 'left' }}>Không có tài khoản nào đã xóa.</p>
              )}
              {!deletedLoading && deletedUsers.length > 0 && (
                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={{ ...styles.tableHeadRow, background: 'linear-gradient(135deg, #e53e3e 0%, #c05621 100%)' }}>
                        <th style={styles.th}>ID</th>
                        <th style={styles.th}>Tên đăng nhập</th>
                        <th style={styles.th}>Email</th>
                        <th style={styles.th}>Vai trò</th>
                        <th style={styles.th}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deletedUsers.map(u => (
                        <tr key={u.id} style={{ ...styles.tableRow, background: '#fff5f5' }}>
                          <td style={styles.td}>{u.id}</td>
                          <td style={{ ...styles.td, textDecoration: 'line-through', color: '#a0aec0' }}>{u.username}</td>
                          <td style={{ ...styles.td, textDecoration: 'line-through', color: '#a0aec0' }}>{u.email}</td>
                          <td style={styles.td}><span style={roleBadgeStyle(u.role)}>{u.role}</span></td>
                          <td style={styles.td}>
                            <button
                              onClick={() => handleRestore(u.id, u.username)}
                              style={styles.restoreBtn}
                            >
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
        </div>

        {/* Action message */}
        {actionMsg && (
          <div style={actionMsg.type === 'success' ? styles.successBanner : styles.errorBanner}>
            {actionMsg.text}
          </div>
        )}

        {/* Users Table */}
        {loading && <p style={styles.statusText}>Đang tải...</p>}
        {fetchError && <p style={styles.errorText}>{fetchError}</p>}

        {!loading && !fetchError && (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeadRow}>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>Tên đăng nhập</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Vai trò</th>
                  <th style={styles.th}>Trạng thái</th>
                  <th style={styles.th}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr
                    key={u.id}
                    style={u.id === currentUser.id ? { ...styles.tableRow, background: '#fafbff' } : styles.tableRow}
                  >
                    <td style={styles.td}>{u.id}</td>
                    <td style={styles.td}>
                      {u.username}
                      {u.id === currentUser.id && <span style={styles.selfBadge}> (bạn)</span>}
                    </td>
                    <td style={styles.td}>{u.email}</td>
                    <td style={styles.td}>
                      {u.id === currentUser.id ? (
                        <span style={roleBadgeStyle(u.role)}>{u.role}</span>
                      ) : (
                        <select
                          style={styles.roleSelect}
                          value={u.role}
                          onChange={e => handleRoleChange(u.id, e.target.value)}
                        >
                          {ROLES.map(r => (
                            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td style={styles.td}>
                      <span style={u.is_active ? styles.activeBadge : styles.lockedBadge}>
                        {u.is_active ? '● Hoạt động' : '● Đã khóa'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {u.id !== currentUser.id ? (
                        <div style={styles.actionGroup}>
                          <button
                            onClick={() => handleToggleLock(u.id)}
                            style={u.is_active ? styles.lockBtn : styles.unlockBtn}
                          >
                            {u.is_active ? '🔒 Khóa' : '🔓 Mở khóa'}
                          </button>
                          <button
                            onClick={() => handleSoftDelete(u.id, u.username)}
                            style={styles.deleteBtn}
                          >
                            🗑️ Xóa
                          </button>
                        </div>
                      ) : (
                        <span style={styles.naText}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: '#888', padding: '32px' }}>
                      Chưa có tài khoản nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const roleBadgeStyle = (role) => ({
  background: role === 'admin' ? '#fed7d7' : role === 'teacher' ? '#bee3f8' : '#e9d8fd',
  color: role === 'admin' ? '#c53030' : role === 'teacher' ? '#2b6cb0' : '#553c9a',
  padding: '3px 10px',
  borderRadius: '12px',
  fontSize: '12px',
  fontWeight: '600',
  display: 'inline-block'
});

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
  headerLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  headerRight: {},
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
  content: { maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  sectionTitle: { color: '#333', margin: 0, fontSize: '20px' },
  createBtn: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    border: 'none',
    padding: '10px 22px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px'
  },
  createCard: {
    background: '#fff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    marginBottom: '24px',
    borderLeft: '4px solid #667eea'
  },
  createTitle: { color: '#333', marginTop: 0, marginBottom: '18px', fontSize: '16px' },
  formRow: { display: 'flex', gap: '16px', marginBottom: '14px' },
  formGroup: { flex: 1 },
  label: { display: 'block', color: '#555', fontSize: '13px', fontWeight: '600', marginBottom: '6px' },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
    boxSizing: 'border-box',
    outline: 'none',
    color: '#333'
  },
  submitBtn: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    border: 'none',
    padding: '10px 26px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
    marginTop: '6px'
  },
  successBanner: {
    background: '#f0fff4',
    color: '#276749',
    border: '1px solid #c6f6d5',
    padding: '10px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px'
  },
  errorBanner: {
    background: '#fff5f5',
    color: '#c53030',
    border: '1px solid #fed7d7',
    padding: '10px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px'
  },
  tableWrapper: {
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    overflow: 'hidden'
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableHeadRow: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  th: { padding: '14px 16px', color: '#fff', textAlign: 'left', fontSize: '13px', fontWeight: '600' },
  tableRow: { borderBottom: '1px solid #f0f0f0' },
  td: { padding: '13px 16px', fontSize: '14px', color: '#333' },
  selfBadge: { color: '#999', fontSize: '12px', fontStyle: 'italic' },
  roleSelect: {
    padding: '5px 10px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    fontSize: '13px',
    cursor: 'pointer',
    color: '#333'
  },
  activeBadge: {
    background: '#c6f6d5',
    color: '#276749',
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600'
  },
  lockedBadge: {
    background: '#fed7d7',
    color: '#c53030',
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600'
  },
  lockBtn: {
    background: '#fff5f5',
    color: '#c53030',
    border: '1px solid #fed7d7',
    padding: '5px 13px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600'
  },
  unlockBtn: {
    background: '#f0fff4',
    color: '#276749',
    border: '1px solid #c6f6d5',
    padding: '5px 13px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600'
  },
  naText: { color: '#ccc', fontSize: '14px' },
  deletedSection: { marginBottom: '24px' },
  deletedToggleBtn: {
    background: '#fff5f5',
    color: '#c53030',
    border: '1px solid #fed7d7',
    padding: '9px 18px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
  },
  restoreBtn: {
    background: '#f0fff4',
    color: '#276749',
    border: '1px solid #c6f6d5',
    padding: '5px 13px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600'
  },
  actionGroup: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  deleteBtn: {
    background: '#fffaf0',
    color: '#c05621',
    border: '1px solid #fbd38d',
    padding: '5px 13px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600'
  },
  statusText: { color: '#888', textAlign: 'center', padding: '40px' },
  errorText: { color: '#c53030', fontSize: '14px', margin: '8px 0' },
  successText: { color: '#276749', fontSize: '14px', margin: '8px 0' }
};

export default AdminAccountManager;
