import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Mail, ShieldCheck, GraduationCap, Lock, Eye, EyeOff, Loader2, Check, LogOut } from 'lucide-react';
import api from '../services/api';
import { passwordProblem, PASSWORD_RULE_TEXT } from '../../utils/validation.js';

/**
 * Hồ sơ của tôi (menu tài khoản ở góc phải -> "Hồ sơ của tôi").
 * Xem thông tin tài khoản, đổi tên hiển thị, đổi mật khẩu. Email là thông tin đăng nhập nên không đổi ở đây.
 */
const initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return String(name || 'U').slice(0, 2).toUpperCase();
};

function Notice({ msg }) {
  if (!msg) return null;
  const ok = msg.type === 'success';
  return (
    <div role={ok ? 'status' : 'alert'} className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${ok ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-red-100 bg-red-50 text-red-600'}`}>
      {ok && <Check className="h-4 w-4 shrink-0" />}
      {msg.text}
    </div>
  );
}

function PasswordInput({ id, label, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} required
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
        />
        <button
          type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || '{}'));
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(user.username || '');
  const [nameMsg, setNameMsg] = useState(null);
  const [savingName, setSavingName] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState(null);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    api.get('/auth/profile')
      .then((r) => { setUser(r.data); setName(r.data.username || ''); })
      .catch(() => { /* lỗi 401 thì api.js tự đưa về /login */ })
      .finally(() => setLoading(false));
  }, []);

  // giữ menu tài khoản (đọc localStorage) khớp với tên mới
  const remember = (u) => {
    const old = JSON.parse(localStorage.getItem('user') || '{}');
    localStorage.setItem('user', JSON.stringify({ ...old, id: u.id, username: u.username, email: u.email, role: u.role }));
  };

  const saveName = async (e) => {
    e.preventDefault();
    setNameMsg(null);
    setSavingName(true);
    try {
      const r = await api.put('/auth/profile', { username: name.trim() });
      setUser((u) => ({ ...u, ...r.data }));
      remember(r.data);
      setNameMsg({ type: 'success', text: 'Đã lưu tên hiển thị' });
    } catch (err) {
      setNameMsg({ type: 'error', text: err.response?.data?.message || 'Không lưu được tên' });
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    const problem = passwordProblem(pw.next, { email: user.email, username: user.username });
    if (problem) { setPwMsg({ type: 'error', text: problem.replace(/^Mật khẩu/, 'Mật khẩu mới') }); return; }
    if (pw.next !== pw.confirm) { setPwMsg({ type: 'error', text: 'Hai ô mật khẩu mới chưa giống nhau' }); return; }
    setSavingPw(true);
    try {
      const r = await api.put('/auth/password', { currentPassword: pw.current, newPassword: pw.next });
      // token cũ hết hiệu lực khi đổi mật khẩu -> giữ token mới để không bị đăng xuất
      if (r.data?.token) localStorage.setItem('token', r.data.token);
      setPw({ current: '', next: '', confirm: '' });
      setPwMsg({ type: 'success', text: 'Đã đổi mật khẩu. Các thiết bị khác đang đăng nhập sẽ phải đăng nhập lại bằng mật khẩu mới.' });
    } catch (err) {
      setPwMsg({ type: 'error', text: err.response?.data?.message || 'Không đổi được mật khẩu' });
    } finally {
      setSavingPw(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const isAdmin = user.role === 'admin';
  const RoleIcon = isAdmin ? ShieldCheck : GraduationCap;
  const nameChanged = name.trim() && name.trim() !== (user.username || '');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-100 bg-white px-6 shadow-sm sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-[#ffffff] shadow-md shadow-blue-500/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <span className="block text-xl font-bold leading-tight tracking-tight text-slate-900">Lingua</span>
            <span className="text-[11px] font-medium text-slate-400">Hồ sơ của tôi</span>
          </div>
        </div>
        <button
          onClick={() => navigate(isAdmin ? '/admin/content' : '/')}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> {isAdmin ? 'Về trang quản trị' : 'Về trang học'}
        </button>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-6 sm:p-8">
        {/* Thẻ tài khoản */}
        <section className="flex flex-col gap-5 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-2xl font-bold text-indigo-700 shadow-inner">
            {initials(user.username)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold text-slate-900">{loading ? 'Đang tải…' : user.username}</h1>
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-500"><Mail className="h-4 w-4 shrink-0" /> {user.email}</p>
            <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${isAdmin ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
              <RoleIcon className="h-3.5 w-3.5" /> {isAdmin ? 'Quản trị viên' : 'Học viên'}
            </span>
          </div>
          <button onClick={logout} className="inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 sm:self-center">
            <LogOut className="h-4 w-4" /> Đăng xuất
          </button>
        </section>

        {/* Tên hiển thị */}
        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Thông tin cá nhân</h2>
          <p className="mt-1 text-sm text-slate-500">Tên hiển thị ở góc trên và trong lịch sử làm bài.</p>
          <form onSubmit={saveName} className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pf-name" className="mb-1.5 block text-sm font-semibold text-slate-700">Tên hiển thị</label>
              <input
                id="pf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              />
            </div>
            <div>
              <label htmlFor="pf-email" className="mb-1.5 block text-sm font-semibold text-slate-700">Email đăng nhập</label>
              <input
                id="pf-email" value={user.email || ''} disabled
                className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit" disabled={savingName || !nameChanged}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-[#ffffff] shadow-md shadow-blue-500/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingName && <Loader2 className="h-4 w-4 animate-spin" />} Lưu tên
              </button>
            </div>
          </form>
          <Notice msg={nameMsg} />
        </section>

        {/* Đổi mật khẩu */}
        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Đổi mật khẩu</h2>
          <p className="mt-1 text-sm text-slate-500">{PASSWORD_RULE_TEXT}</p>
          <form onSubmit={savePassword} className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 sm:max-w-sm">
              <PasswordInput id="pf-cur" label="Mật khẩu hiện tại" value={pw.current} onChange={(v) => setPw((p) => ({ ...p, current: v }))} autoComplete="current-password" />
            </div>
            <PasswordInput id="pf-new" label="Mật khẩu mới" value={pw.next} onChange={(v) => setPw((p) => ({ ...p, next: v }))} autoComplete="new-password" />
            <PasswordInput id="pf-new2" label="Nhập lại mật khẩu mới" value={pw.confirm} onChange={(v) => setPw((p) => ({ ...p, confirm: v }))} autoComplete="new-password" />
            <div className="sm:col-span-2">
              <button
                type="submit" disabled={savingPw || !pw.current || !pw.next || !pw.confirm}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-[#ffffff] shadow-md shadow-blue-500/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingPw && <Loader2 className="h-4 w-4 animate-spin" />} Đổi mật khẩu
              </button>
            </div>
          </form>
          <Notice msg={pwMsg} />
        </section>
      </main>
    </div>
  );
}
