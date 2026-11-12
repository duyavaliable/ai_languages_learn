import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Loader2 } from 'lucide-react';
import api from '../services/api';
import {
  AuthLayout, ErrorBox, PasswordInput, GoogleButton, GoogleSignupStep, useGoogleAuth, storeSession, inputCls, primaryBtnCls
} from '../components/auth/AuthShell';

/*
 * Đăng nhập. Nút Google:
 *   email Google trùng tài khoản có sẵn -> đăng nhập thẳng
 *   chưa có tài khoản                   -> bước "Đặt mật khẩu cho Lingua" rồi tạo tài khoản học viên
 *   tài khoản bị khoá / đã xoá          -> báo lỗi
 */
function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const signIn = (data) => { storeSession(data); navigate('/'); };
  const g = useGoogleAuth({ onSignedIn: signIn, setError });

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', form);
      signIn(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {g.signup ? (
        <GoogleSignupStep g={g} error={error} backLabel="Quay lại đăng nhập" onBack={() => { g.setSignup(null); setError(''); }} />
      ) : (
        <>
          <h1 className="text-2xl font-bold text-slate-900">Đăng nhập</h1>
          <p className="mt-1 text-sm text-slate-500">Chào mừng bạn quay lại! Đăng nhập để tiếp tục học.</p>

          <ErrorBox error={error} />

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-sm font-semibold text-slate-700">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-email" type="email" name="email" autoComplete="email" autoFocus
                  value={form.email} onChange={handleChange}
                  placeholder="Nhập email của bạn" className={inputCls} required
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-sm font-semibold text-slate-700">Mật khẩu</label>
              <PasswordInput
                id="login-password" name="password" autoComplete="current-password" placeholder="Nhập mật khẩu"
                value={form.password} onChange={handleChange} show={showPw} onToggle={() => setShowPw((v) => !v)}
              />
            </div>

            <button type="submit" disabled={loading} className={primaryBtnCls}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>

          <GoogleButton onCredential={g.handleCredential} onError={setError} />
          {g.busy && (
            <p className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Đang đăng nhập bằng Google…</p>
          )}

          <p className="mt-8 text-center text-sm text-slate-500">
            Chưa có tài khoản?{' '}
            <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-700">Đăng ký ngay</Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}

export default LoginPage;
