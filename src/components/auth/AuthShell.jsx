import { useEffect, useRef, useState } from 'react';
import { Sparkles, Lock, Eye, EyeOff, Headphones, Mic, BookOpen, PenLine, Loader2, User, ArrowLeft } from 'lucide-react';
import api from '../../services/api';
import { passwordProblem, usernameProblem, PASSWORD_RULE_TEXT } from '../../../utils/validation.js';
/*
 * Phần dùng chung của trang Đăng nhập và Đăng ký:
 *   AuthLayout       — khung 2 cột (cột xanh giới thiệu + cột form), cùng giao diện trang học / quản trị
 *   GoogleButton     — nút Google (Google Identity Services); chưa đặt GOOGLE_CLIENT_ID thì ẩn
 *   GoogleSignupStep — bước "Đặt mật khẩu cho Lingua" khi email Google chưa có tài khoản
 *   useGoogleAuth    — gọi /auth/google rồi /auth/google/register
 * Server: controllers/authController.js (googleLogin / googleRegister).
 */

export const inputCls = 'w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10';
export const primaryBtnCls = 'mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-[#ffffff] shadow-md shadow-blue-500/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60';

const SKILLS = [
  { icon: Headphones, label: 'Nghe', note: 'Đề luyện có file nghe theo từng phần' },
  { icon: Mic, label: 'Nói', note: 'Chấm phát âm khi đọc to' },
  { icon: BookOpen, label: 'Đọc', note: 'Đề đọc hiểu như đề thi thật' },
  { icon: PenLine, label: 'Viết', note: 'Nhận xét bài viết chi tiết' }
];

export function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl grid lg:grid-cols-2 lg:min-h-[620px] bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/60 overflow-hidden">
        {/* Giới thiệu — chỉ hiện ở màn rộng */}
        <aside className="hidden lg:flex flex-col justify-between gap-10 bg-blue-600 p-10 text-[#ffffff] relative overflow-hidden">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#ffffff]/10" aria-hidden="true" />
          <div className="absolute -left-16 bottom-10 h-48 w-48 rounded-full bg-[#ffffff]/5" aria-hidden="true" />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 bg-[#ffffff]/15 rounded-xl flex items-center justify-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight block leading-tight">Lingua</span>
              <span className="text-[11px] text-blue-100 font-medium">Learn &amp; Practice</span>
            </div>
          </div>
          <div className="relative">
            <h2 className="text-3xl font-bold leading-tight">Luyện tiếng Anh và tiếng Nhật mỗi ngày</h2>
            <p className="mt-3 text-sm text-blue-100">Bài tập theo từng kỹ năng, làm bài như thi thật và xem kết quả ngay.</p>
            <ul className="mt-8 grid grid-cols-2 gap-3">
              {SKILLS.map(({ icon: Icon, label, note }) => (
                <li key={label} className="rounded-2xl bg-[#ffffff]/10 p-4">
                  <Icon className="h-5 w-5" />
                  <p className="mt-2 text-sm font-semibold">{label}</p>
                  <p className="text-xs text-blue-100">{note}</p>
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs text-blue-200">© {new Date().getFullYear()} Lingua</p>
        </aside>

        <main className="p-8 sm:p-12 flex flex-col justify-center">
          <div className="flex items-center gap-3 lg:hidden mb-8">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-[#ffffff] shadow-md shadow-blue-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xl font-bold text-slate-900 tracking-tight block leading-tight">Lingua</span>
              <span className="text-[11px] text-slate-400 font-medium">Learn &amp; Practice</span>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

export function ErrorBox({ error, className = 'mt-6' }) {
  if (!error) return null;
  return (
    <div role="alert" className={`${className} rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600`}>
      {error}
    </div>
  );
}

export function PasswordInput({ id, value, onChange, show, onToggle, placeholder, autoComplete = 'new-password', autoFocus, name }) {
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        id={id} name={name} type={show ? 'text' : 'password'} autoComplete={autoComplete} autoFocus={autoFocus} required
        value={value} onChange={onChange} placeholder={placeholder}
        className={`${inputCls} ${onToggle ? 'pr-10' : ''}`}
      />
      {onToggle && (
        <button
          type="button" onClick={onToggle} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

// ----- Google -----
const GIS_SRC = 'https://accounts.google.com/gsi/client';
function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Không tải được nút Google (kiểm tra mạng)'));
    document.head.appendChild(s);
  });
}

/** Nút Google gọn: chỉ biểu tượng "G" tròn, đặt dưới đường kẻ "hoặc". */
export function GoogleButton({ onCredential, onError, divider = 'hoặc' }) {
  const ref = useRef(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [clientId, setClientId] = useState(null);
  useEffect(() => {
    api.get('/auth/google/config').then((r) => setClientId(r.data?.clientId || null)).catch(() => setClientId(null));
  }, []);
  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    loadGis().then(() => {
      if (cancelled || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId, ux_mode: 'popup', auto_select: false,
        callback: ({ credential }) => cb.current(credential)
      });
      ref.current.innerHTML = '';
      // Nút thật của Google nằm trong suốt đè lên nút "Google" tự vẽ (kiểu "chỉ biểu tượng" của Google bị trống),
      // nên bấm vào nút tự vẽ là bấm vào nút Google.
      window.google.accounts.id.renderButton(ref.current, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', width: 200, locale: 'vi' });
    }).catch((e) => onError?.(e.message));
    return () => { cancelled = true; };
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!clientId) return null;
  return (
    <>
      <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> {divider} <span className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="flex justify-center">
        <div className="group relative h-10 w-[200px] overflow-hidden rounded-full">
          <div
            aria-hidden="true"
            className="pointer-events-none flex h-full w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors group-hover:border-slate-300 group-hover:bg-slate-50"
          >
            <GoogleG className="h-[18px] w-[18px]" /> Google
          </div>
          <div ref={ref} title="Google" className="absolute inset-0 flex items-center justify-center opacity-[0.01]" />
        </div>
      </div>
    </>
  );
}

function GoogleG({ className }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

/** Tên gợi ý khi đăng ký bằng Google: tên tài khoản Google, không có thì phần trước @ của email. */
const suggestName = (g) => (String(g?.name || '').trim() || String(g?.email || '').split('@')[0]).slice(0, 50);

/**
 * Luồng Google dùng chung. onSignedIn(data) được gọi khi đã có token (đăng nhập thẳng hoặc vừa tạo tài khoản).
 * Email chưa có tài khoản -> trả về `signup` (hiện GoogleSignupStep).
 */
export function useGoogleAuth({ onSignedIn, setError }) {
  const [signup, setSignup] = useState(null); // { ticket, email, name, picture }
  const [form, setForm] = useState({ username: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  const handleCredential = async (credential) => {
    setError('');
    setBusy(true);
    try {
      const res = await api.post('/auth/google', { credential });
      if (res.data?.needPassword) {
        setSignup(res.data);
        setForm({ username: suggestName(res.data), password: '', confirm: '' });
      } else {
        onSignedIn(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không dùng được tài khoản Google');
    } finally {
      setBusy(false);
    }
  };

  const submitSignup = async (e) => {
    e.preventDefault();
    setError('');
    const problem = usernameProblem(form.username)
      || passwordProblem(form.password, { email: signup?.email, username: form.username });
    if (problem) { setError(problem); return; }
    if (form.password !== form.confirm) { setError('Hai ô mật khẩu chưa giống nhau'); return; }
    setBusy(true);
    try {
      const res = await api.post('/auth/google/register', { ticket: signup.ticket, username: form.username.trim(), password: form.password });
      onSignedIn(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Không tạo được tài khoản');
    } finally {
      setBusy(false);
    }
  };

  return { signup, setSignup, form, setForm, busy, handleCredential, submitSignup };
}

export function GoogleSignupStep({ g, error, onBack, backLabel }) {
  const [showPw, setShowPw] = useState(false);
  const { signup, form, setForm, busy, submitSignup } = g;
  return (
    <>
      <button
        type="button" onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </button>
      <h1 className="text-2xl font-bold text-slate-900">Đặt mật khẩu cho Lingua</h1>
      <p className="mt-1 text-sm text-slate-500">Tạo tài khoản bằng email Google bên dưới. Đặt một mật khẩu riêng cho trang web (khác mật khẩu Google) — sau này đăng nhập bằng Google hoặc bằng email + mật khẩu này đều được.</p>
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
        {signup.picture
          ? <img src={signup.picture} alt="" referrerPolicy="no-referrer" className="h-10 w-10 rounded-full" />
          : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700"><User className="h-5 w-5" /></div>}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{signup.name || 'Tài khoản Google'}</p>
          <p className="truncate text-xs text-slate-500">{signup.email}</p>
        </div>
      </div>

      <ErrorBox error={error} className="mt-4" />

      <form onSubmit={submitSignup} className="mt-5 space-y-4">
        <div>
          <label htmlFor="g-name" className="mb-1.5 block text-sm font-semibold text-slate-700">Tên người dùng</label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="g-name" value={form.username} maxLength={50} required
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              className={inputCls}
            />
          </div>
          <p className="mt-1 text-xs text-slate-400">Lấy sẵn từ tên tài khoản Google — bạn có thể đổi.</p>
        </div>
        <div>
          <label htmlFor="g-pw" className="mb-1.5 block text-sm font-semibold text-slate-700">Mật khẩu</label>
          <PasswordInput
            id="g-pw" autoFocus show={showPw} onToggle={() => setShowPw((v) => !v)}
            value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
          <p className="mt-1 text-xs text-slate-400">{PASSWORD_RULE_TEXT}</p>
        </div>
        <div>
          <label htmlFor="g-pw2" className="mb-1.5 block text-sm font-semibold text-slate-700">Nhập lại mật khẩu</label>
          <PasswordInput
            id="g-pw2" show={showPw}
            value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
          />
        </div>
        <button type="submit" disabled={busy} className={primaryBtnCls}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? 'Đang tạo tài khoản...' : 'Tạo tài khoản và đăng nhập'}
        </button>
      </form>
    </>
  );
}

/** Lưu phiên đăng nhập như trang Đăng nhập vẫn làm. */
export function storeSession(data) {
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify({ id: data.id, username: data.username, email: data.email, role: data.role }));
}
