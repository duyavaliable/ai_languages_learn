import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserCheck, GraduationCap, ShieldCheck, Plus, X, Lock, Unlock, Trash2, RotateCcw, Search } from 'lucide-react';
import api from '../services/api';
import { passwordProblem, usernameProblem, isEmail, PASSWORD_RULE_TEXT } from '../../utils/validation.js';
import AdminLayout, { AdminNotice, StatTile } from '../components/admin/AdminLayout';

// Chỉ còn hai vai trò: học viên và admin (vai trò teacher đã bỏ).
const ROLES = ['student', 'admin'];
const ROLE_LABEL = { student: 'Học viên', admin: 'Admin' };
const ROLE_BADGE = {
  admin: 'bg-red-50 text-red-600',
  student: 'bg-indigo-50 text-indigo-600'
};

const inputCls = 'w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors';
const btnPrimary = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-[#ffffff] bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-colors';
const btnSoft = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors';

function AdminAccountManager() {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [search, setSearch] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', email: '', password: '', role: 'student' });
  const [createMsg, setCreateMsg] = useState(null);

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
    setCreateMsg(null);
    const problem = usernameProblem(createForm.username)
      || (isEmail(createForm.email.trim()) ? null : 'Email không hợp lệ')
      || passwordProblem(createForm.password, { email: createForm.email, username: createForm.username });
    if (problem) { setCreateMsg({ type: 'error', text: problem }); return; }
    try {
      await api.post('/users', createForm);
      setCreateMsg({ type: 'success', text: 'Tạo tài khoản thành công!' });
      setCreateForm({ username: '', email: '', password: '', role: 'student' });
      fetchUsers();
    } catch (err) {
      setCreateMsg({ type: 'error', text: err.response?.data?.message || 'Tạo tài khoản thất bại' });
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

  const activeCount = users.filter((user) => user.is_active).length;
  const studentCount = users.filter((user) => user.role === 'student').length;
  const adminCount = users.filter((user) => user.role === 'admin').length;

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => [u.username, u.email, u.role].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [users, search]);

  return (
    <AdminLayout
      title="Quản lý tài khoản"
      subtitle="Phân quyền, khoá / mở khoá và khôi phục tài khoản"
      actions={(
        <button
          onClick={() => { setShowCreateForm(!showCreateForm); setCreateMsg(null); }}
          className={btnPrimary}
        >
          {showCreateForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showCreateForm ? 'Đóng form' : 'Tạo tài khoản'}
        </button>
      )}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={Users} label="Tổng" value={users.length} />
        <StatTile icon={UserCheck} label="Hoạt động" value={activeCount} color="text-emerald-600 bg-emerald-50" />
        <StatTile icon={GraduationCap} label="Học viên" value={studentCount} color="text-indigo-600 bg-indigo-50" />
        <StatTile icon={ShieldCheck} label="Admin" value={adminCount} color="text-red-600 bg-red-50" />
      </div>

      {showCreateForm && (
        <form onSubmit={handleCreateSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h3 className="text-base font-bold text-slate-900">Tạo tài khoản mới</h3>
          <AdminNotice data={createMsg} />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-500 mb-1.5">Tên đăng nhập</span>
              <input className={inputCls} value={createForm.username} required placeholder="Nhập tên đăng nhập"
                onChange={e => setCreateForm(p => ({ ...p, username: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-500 mb-1.5">Email</span>
              <input className={inputCls} type="email" value={createForm.email} required placeholder="Nhập email"
                onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-500 mb-1.5">Mật khẩu</span>
              <input className={inputCls} type="password" value={createForm.password} required placeholder="Nhập mật khẩu" autoComplete="new-password"
                onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))} />
              <span className="mt-1 block text-[11px] text-slate-400">{PASSWORD_RULE_TEXT}</span>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-500 mb-1.5">Vai trò</span>
              <select className={inputCls} value={createForm.role}
                onChange={e => setCreateForm(p => ({ ...p, role: e.target.value }))}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
          </div>
          <button type="submit" className={btnPrimary}>Tạo tài khoản</button>
        </form>
      )}

      <AdminNotice data={actionMsg} />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Danh sách tài khoản <span className="text-slate-400 font-semibold">({filteredUsers.length})</span></h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tên, email, vai trò..."
                className="w-56 pl-9 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-full text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <button
              onClick={handleToggleDeletedList}
              className={`${btnSoft} px-3 py-2 rounded-full ${showDeleted ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {showDeleted ? 'Ẩn đã xoá' : 'Đã xoá mềm'}
            </button>
          </div>
        </div>

        {loading && <p className="py-12 text-center text-sm text-slate-400">Đang tải...</p>}
        {fetchError && <p className="py-12 text-center text-sm text-red-600">{fetchError}</p>}

        {!loading && !fetchError && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">ID</th>
                  <th className="px-5 py-3">Tên đăng nhập</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Vai trò</th>
                  <th className="px-5 py-3">Trạng thái</th>
                  <th className="px-5 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map(u => {
                  const isSelf = u.id === currentUser.id;
                  return (
                    <tr key={u.id} className={isSelf ? 'bg-blue-50/40' : 'hover:bg-slate-50/60'}>
                      <td className="px-5 py-3 text-slate-400 tabular-nums">{u.id}</td>
                      <td className="px-5 py-3 font-semibold text-slate-800">
                        {u.username}
                        {isSelf && <span className="ml-1.5 text-xs font-medium text-slate-400">(bạn)</span>}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{u.email}</td>
                      <td className="px-5 py-3">
                        {isSelf ? (
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${ROLE_BADGE[u.role] || ROLE_BADGE.student}`}>{ROLE_LABEL[u.role] || u.role}</span>
                        ) : (
                          <select
                            value={u.role}
                            onChange={e => handleRoleChange(u.id, e.target.value)}
                            className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 cursor-pointer"
                          >
                            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          {u.is_active ? 'Hoạt động' : 'Đã khoá'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {!isSelf ? (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleToggleLock(u.id)}
                              className={`${btnSoft} ${u.is_active ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                            >
                              {u.is_active ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                              {u.is_active ? 'Khoá' : 'Mở khoá'}
                            </button>
                            <button
                              onClick={() => handleSoftDelete(u.id, u.username)}
                              className={`${btnSoft} bg-red-50 text-red-600 hover:bg-red-100`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Xoá
                            </button>
                          </div>
                        ) : (
                          <span className="block text-right text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">Không có tài khoản nào.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showDeleted && (
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/50">
            <h2 className="font-bold text-slate-900">Tài khoản đã xoá mềm <span className="text-slate-400 font-semibold">({deletedUsers.length})</span></h2>
          </div>
          {deletedLoading && <p className="py-10 text-center text-sm text-slate-400">Đang tải...</p>}
          {!deletedLoading && deletedUsers.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">Không có tài khoản nào đã xoá.</p>
          )}
          {!deletedLoading && deletedUsers.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">ID</th>
                  <th className="px-5 py-3">Tên đăng nhập</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Vai trò</th>
                  <th className="px-5 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deletedUsers.map(u => (
                  <tr key={u.id}>
                    <td className="px-5 py-3 text-slate-400 tabular-nums">{u.id}</td>
                    <td className="px-5 py-3 text-slate-400 line-through">{u.username}</td>
                    <td className="px-5 py-3 text-slate-400 line-through">{u.email}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${ROLE_BADGE[u.role] || ROLE_BADGE.student}`}>{ROLE_LABEL[u.role] || u.role}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => handleRestore(u.id, u.username)} className={`${btnSoft} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
                        <RotateCcw className="w-3.5 h-3.5" />
                        Khôi phục
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

export default AdminAccountManager;
