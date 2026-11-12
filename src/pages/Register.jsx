import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, User, Loader2 } from 'lucide-react';
import api from '../services/api';
import {
  AuthLayout, ErrorBox, PasswordInput, GoogleButton, GoogleSignupStep, useGoogleAuth, storeSession, inputCls, primaryBtnCls
} from '../components/auth/AuthShell';
import { passwordProblem, usernameProblem, isEmail, PASSWORD_RULE_TEXT } from '../../utils/validation.js';

/*
 * Đăng ký — cùng giao diện với trang Đăng nhập.
 *   "Đăng ký bằng Google" (nhanh, đặt ở trên): lấy email + tên từ tài khoản Google, người dùng sửa tên nếu muốn
 *     và đặt mật khẩu riêng cho Lingua -> tạo tài khoản học viên và đăng nhập luôn.
 *     Email Google đã có tài khoản thì đăng nhập thẳng vào tài khoản đó.
 *   Đăng ký thủ công (như cũ): tên + email + mật khẩu -> chuyển sang trang Đăng nhập.
 */
function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const g = useGoogleAuth({ onSignedIn: (data) => { storeSession(data); navigate('/'); }, setError });

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const problem = usernameProblem(form.username)
      || (isEmail(form.email.trim()) ? null : 'Email không hợp lệ')
      || passwordProblem(form.password, { email: form.email, username: form.username });
    if (problem) { setError(problem); return; }
    setLoading(true);
    try {
      await api.post('/auth/register', { username: form.username.trim(), email: form.email.trim(), password: form.password });
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng ký thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {g.signup ? (
        <GoogleSignupStep g={g} error={error} backLabel="Quay lại đăng ký" onBack={() => { g.setSignup(null); setError(''); }} />
      ) : (
        <>
          <h1 className="text-2xl font-bold text-slate-900">Tạo tài khoản</h1>
          <p className="mt-1 text-sm text-slate-500">Tạo tài khoản để bắt đầu học!</p>

          <ErrorBox error={error} />

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="reg-name" className="mb-1.5 block text-sm font-semibold text-slate-700">Tên người dùng</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="reg-name" type="text" name="username" autoComplete="nickname" maxLength={50}
                  value={form.username} onChange={handleChange}
                  placeholder="Nhập tên người dùng" className={inputCls} required
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-email" className="mb-1.5 block text-sm font-semibold text-slate-700">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="reg-email" type="email" name="email" autoComplete="email"
                  value={form.email} onChange={handleChange}
                  placeholder="Nhập email của bạn" className={inputCls} required
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-password" className="mb-1.5 block text-sm font-semibold text-slate-700">Mật khẩu</label>
              <PasswordInput
                id="reg-password" name="password" placeholder="Nhập mật khẩu"
                value={form.password} onChange={handleChange} show={showPw} onToggle={() => setShowPw((v) => !v)}
              />
              <p className="mt-1 text-xs text-slate-400">{PASSWORD_RULE_TEXT}</p>
            </div>

            <button type="submit" disabled={loading} className={primaryBtnCls}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Đang đăng ký...' : 'Đăng ký'}
            </button>
          </form>

          <GoogleButton onCredential={g.handleCredential} onError={setError} />
          {g.busy && (
            <p className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Đang lấy thông tin tài khoản Google…</p>
          )}

          <p className="mt-8 text-center text-sm text-slate-500">
            Đã có tài khoản?{' '}
            <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">Đăng nhập</Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}

export default RegisterPage;
