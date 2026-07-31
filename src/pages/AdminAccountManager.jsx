import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  Users,
  UserCheck,
  ShieldCheck,
  GraduationCap,
  Plus,
  Lock,
  Unlock,
  Trash2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import PageHeader from '../components/admin/ui/PageHeader';
import StatCard from '../components/admin/ui/StatCard';
import StatusBadge from '../components/admin/ui/StatusBadge';
import EmptyState from '../components/admin/ui/EmptyState';
import LoadingScreen from '../components/admin/ui/LoadingScreen';
import Modal from '../components/admin/ui/Modal';
import ConfirmDialog from '../components/admin/ui/ConfirmDialog';

const ROLES = ['student', 'teacher', 'admin'];

function roleTone(role) {
  if (role === "admin") return "danger"
  if (role === "teacher") return "teal"
  return "primary"
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-admin-card-foreground">{label}</span>
      {children}
    </label>
  )
}

function AdminAccountManager() {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  const [users, setUsers] = useState([]);
  const [deletedUsers, setDeletedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [deletedLoading, setDeletedLoading] = useState(false);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [creating, setCreating] = useState(false);

  const [createForm, setCreateForm] = useState({
    username: "",
    email: "",
    password: "",
    role: "student",
  });

  const [actionMsg, setActionMsg] = useState(null);
  const [confirm, setConfirm] = useState(null);

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

  const fetchDeletedUsers = () => {
    setDeletedLoading(true);
    api.get('/users/deleted')
      .then(res => {
        setDeletedUsers(res.data);
        setDeletedLoading(false);
      })
      .catch(() => setDeletedLoading(false));
  };

  useEffect(() => {
    if (currentUser.role !== 'admin') {
      navigate('/');
      return;
    }
    fetchUsers();
  }, []);

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.is_active).length;
    const teachers = users.filter((u) => u.role === "teacher").length;
    const admins = users.filter((u) => u.role === "admin").length;
    return { total, active, teachers, admins };
  }, [users]);

  // Logic Handlers
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.username || !createForm.email || !createForm.password) {
      setActionMsg({ type: 'error', text: 'Vui lòng nhập đầy đủ thông tin' });
      return;
    }
    setCreating(true);
    try {
      await api.post('/users', createForm);
      setActionMsg({ type: 'success', text: 'Tạo tài khoản thành công!' });
      setCreateForm({ username: '', email: '', password: '', role: 'student' });
      setShowCreateForm(false);
      fetchUsers();
    } catch (err) {
      setActionMsg({ type: 'error', text: err.response?.data?.message || 'Tạo tài khoản thất bại' });
    } finally {
      setCreating(false);
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

  const handleSoftDelete = (userId, username) => {
    setConfirm({
      title: "Xóa tài khoản?",
      description: `Bạn có chắc muốn xóa mềm tài khoản "${username}"? Tài khoản sẽ được chuyển vào danh sách đã xóa.`,
      confirmLabel: "Xóa mềm",
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api.delete(`/users/${userId}`);
          setUsers(prev => prev.filter(u => u.id !== userId));
          setActionMsg({ type: 'success', text: `Đã xóa tài khoản "${username}"` });
          if (showDeleted) fetchDeletedUsers();
        } catch (err) {
          setActionMsg({ type: 'error', text: err.response?.data?.message || 'Xóa tài khoản thất bại' });
        }
      },
    });
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

  const handleToggleDeletedList = () => {
    const next = !showDeleted;
    setShowDeleted(next);
    if (next) fetchDeletedUsers();
  };

  return (
    <div>
      <PageHeader
        title="Quản lý tài khoản"
        description="Quản lý người dùng, phân quyền và khôi phục tài khoản trên hệ thống Lingua."
        actions={
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center gap-2 rounded-admin-sm bg-admin-primary px-4 py-2.5 text-sm font-semibold text-admin-primary-foreground transition hover:brightness-95"
          >
            <Plus className="h-4 w-4" />
            Tạo tài khoản
          </button>
        }
      />

      {/* Action message */}
      {actionMsg && (
        <div className={`mb-6 p-4 rounded-admin text-sm font-medium border ${
          actionMsg.type === 'success' ? 'bg-admin-success-soft text-admin-success border-admin-success/20' : 'bg-admin-danger-soft text-admin-danger border-admin-danger/20'
        }`}>
          {actionMsg.text}
        </div>
      )}

      {/* Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Tổng tài khoản" value={stats.total} tone="primary" />
        <StatCard icon={UserCheck} label="Đang hoạt động" value={stats.active} tone="success" />
        <StatCard icon={GraduationCap} label="Teacher" value={stats.teachers} tone="teal" />
        <StatCard icon={ShieldCheck} label="Admin" value={stats.admins} tone="warning" />
      </div>

      {/* Deleted list toggle */}
      <div className="mb-4">
        <button
          type="button"
          onClick={handleToggleDeletedList}
          className="inline-flex items-center gap-2 rounded-admin-sm border border-admin-border bg-admin-card px-4 py-2 text-sm font-semibold text-admin-card-foreground transition-colors hover:bg-admin-muted"
        >
          {showDeleted ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Danh sách đã xóa mềm
        </button>
      </div>

      {showDeleted ? (
        <div className="mb-6 overflow-hidden rounded-admin border border-admin-border bg-admin-card shadow-admin-card">
          <div className="border-b border-admin-border px-5 py-4">
            <h2 className="text-sm font-bold text-admin-card-foreground">Tài khoản đã xóa mềm</h2>
          </div>
          {deletedLoading ? (
            <div className="p-8 text-center text-admin-muted-foreground text-sm">Đang tải...</div>
          ) : deletedUsers.length === 0 ? (
            <EmptyState title="Không có tài khoản đã xóa" description="Các tài khoản bị xóa mềm sẽ hiển thị ở đây." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-admin-border text-xs uppercase tracking-wider text-admin-muted-foreground">
                    <th className="px-5 py-3 font-semibold">ID</th>
                    <th className="px-5 py-3 font-semibold">Username</th>
                    <th className="px-5 py-3 font-semibold">Email</th>
                    <th className="px-5 py-3 font-semibold">Vai trò</th>
                    <th className="px-5 py-3 text-right font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedUsers.map((u) => (
                    <tr key={u.id} className="border-b border-admin-border/60 last:border-0">
                      <td className="px-5 py-3 text-admin-muted-foreground">{u.id}</td>
                      <td className="px-5 py-3 font-medium text-admin-card-foreground">{u.username}</td>
                      <td className="px-5 py-3 text-admin-muted-foreground">{u.email}</td>
                      <td className="px-5 py-3">
                        <StatusBadge tone={roleTone(u.role)}>{u.role}</StatusBadge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRestore(u.id, u.username)}
                          className="inline-flex items-center gap-1.5 rounded-admin-sm border border-admin-border bg-admin-card px-3 py-1.5 text-xs font-semibold text-admin-success transition-colors hover:bg-admin-success-soft"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Khôi phục
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* Main table */}
      <div className="overflow-hidden rounded-admin border border-admin-border bg-admin-card shadow-admin-card">
        <div className="flex items-center justify-between border-b border-admin-border px-5 py-4">
          <h2 className="text-sm font-bold text-admin-card-foreground">Danh sách người dùng</h2>
          <span className="text-xs font-medium text-admin-muted-foreground">{users.length} tài khoản</span>
        </div>

        {loading ? (
          <LoadingScreen label="Đang tải danh sách tài khoản..." />
        ) : fetchError ? (
          <EmptyState title="Đã xảy ra lỗi" description={fetchError} />
        ) : users.length === 0 ? (
          <EmptyState title="Chưa có tài khoản" description="Nhấn “Tạo tài khoản” để thêm người dùng mới." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-admin-border text-xs uppercase tracking-wider text-admin-muted-foreground">
                  <th className="px-5 py-3 font-semibold">ID</th>
                  <th className="px-5 py-3 font-semibold">Username</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Vai trò</th>
                  <th className="px-5 py-3 font-semibold">Trạng thái</th>
                  <th className="px-5 py-3 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id
                  return (
                    <tr key={u.id} className="border-b border-admin-border/60 transition-colors last:border-0 hover:bg-admin-muted/40">
                      <td className="px-5 py-3 text-admin-muted-foreground">{u.id}</td>
                      <td className="px-5 py-3">
                        <span className="font-medium text-admin-card-foreground">{u.username}</span>
                        {isSelf ? (
                          <span className="ml-2 rounded-full bg-admin-primary-soft px-2 py-0.5 text-[11px] font-semibold text-admin-primary">
                            bạn
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-admin-muted-foreground">{u.email}</td>
                      <td className="px-5 py-3">
                        {isSelf ? (
                          <StatusBadge tone={roleTone(u.role)}>{u.role}</StatusBadge>
                        ) : (
                          <div className="relative inline-flex">
                            <select
                              value={u.role}
                              onChange={(e) => handleRoleChange(u.id, e.target.value)}
                              className="appearance-none rounded-admin-sm border border-admin-border bg-admin-card py-1.5 pl-3 pr-8 text-xs font-semibold capitalize text-admin-card-foreground transition-colors hover:bg-admin-muted focus:border-admin-ring focus:outline-none focus:ring-2 focus:ring-admin-ring/30"
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-muted-foreground" />
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {u.is_active ? (
                          <StatusBadge tone="success">Hoạt động</StatusBadge>
                        ) : (
                          <StatusBadge tone="danger">Đã khóa</StatusBadge>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {isSelf ? (
                          <div className="text-right text-admin-muted-foreground">—</div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleLock(u.id)}
                              title={u.is_active ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                              className="flex h-8 w-8 items-center justify-center rounded-admin-sm border border-admin-border bg-admin-card text-admin-muted-foreground transition-colors hover:bg-admin-muted hover:text-admin-card-foreground"
                            >
                              {u.is_active ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSoftDelete(u.id, u.username)}
                              title="Xóa tài khoản"
                              className="flex h-8 w-8 items-center justify-center rounded-admin-sm border border-admin-border bg-admin-card text-admin-danger transition-colors hover:bg-admin-danger-soft"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create user modal */}
      <Modal
        open={showCreateForm}
        title="Tạo tài khoản mới"
        description="Điền thông tin để thêm người dùng vào hệ thống."
        onClose={() => setShowCreateForm(false)}
      >
        <form id="create-user-form" onSubmit={handleCreateSubmit} className="flex flex-col gap-4">
          <Field label="Username">
            <input
              type="text"
              value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
              placeholder="vd: mai_tanaka"
              className="rounded-admin-sm border border-admin-border bg-admin-background px-3.5 py-2.5 text-sm text-admin-foreground placeholder:text-admin-muted-foreground focus:border-admin-ring focus:outline-none focus:ring-2 focus:ring-admin-ring/30"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              placeholder="vd: mai@lingua.app"
              className="rounded-admin-sm border border-admin-border bg-admin-background px-3.5 py-2.5 text-sm text-admin-foreground placeholder:text-admin-muted-foreground focus:border-admin-ring focus:outline-none focus:ring-2 focus:ring-admin-ring/30"
            />
          </Field>
          <Field label="Mật khẩu">
            <input
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              placeholder="••••••••"
              className="rounded-admin-sm border border-admin-border bg-admin-background px-3.5 py-2.5 text-sm text-admin-foreground placeholder:text-admin-muted-foreground focus:border-admin-ring focus:outline-none focus:ring-2 focus:ring-admin-ring/30"
            />
          </Field>
          <Field label="Vai trò">
            <div className="relative">
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                className="w-full appearance-none rounded-admin-sm border border-admin-border bg-admin-background px-3.5 py-2.5 pr-9 text-sm capitalize text-admin-foreground focus:border-admin-ring focus:outline-none focus:ring-2 focus:ring-admin-ring/30"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted-foreground" />
            </div>
          </Field>
          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-admin-sm border border-admin-border bg-admin-card px-4 py-2 text-sm font-semibold text-admin-card-foreground transition-colors hover:bg-admin-muted"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-admin-sm bg-admin-primary px-4 py-2 text-sm font-semibold text-admin-primary-foreground transition hover:brightness-95 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {creating ? "Đang tạo..." : "Tạo tài khoản"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

export default AdminAccountManager;
