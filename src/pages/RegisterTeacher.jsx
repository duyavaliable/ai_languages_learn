import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Mail, Lock, Loader2, GraduationCap, ArrowRight } from 'lucide-react';
import api from '../services/api';

function RegisterTeacherPage() {
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
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/register-teacher', form);
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng ký teacher thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-8">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[0%] left-[0%] w-[50%] h-[50%] bg-teal-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[0%] right-[0%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-5xl flex flex-col md:flex-row items-center gap-10 lg:gap-20 relative z-10 animate-fade-in">
        
        {/* Left Side: Branding */}
        <div className="flex-1 text-center md:text-left pt-8 md:pt-0">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-500/10 text-teal-600 border border-teal-500/20 text-sm font-bold tracking-wide uppercase mb-6">
            <GraduationCap className="w-4 h-4" />
            <span>Teacher Workspace</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-card-foreground tracking-tight leading-[1.1] mb-6">
            Đăng ký tài khoản <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-primary">giáo viên</span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto md:mx-0">
            Tạo tài khoản để truy cập không gian làm việc chuyên dụng, nơi bạn có thể tạo từ vựng, thiết kế bài tập và quản lý khóa học của mình.
          </p>
        </div>

        {/* Right Side: Registration Form */}
        <div className="w-full max-w-[420px] bg-card/80 backdrop-blur-xl rounded-[1.5rem] shadow-shadow-elegant border border-border/50 p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-card-foreground tracking-tight">
              Đăng ký Teacher
            </h2>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Một bước để vào dashboard dành cho giáo viên.
            </p>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium px-4 py-3 rounded-xl mb-6 animate-in slide-in-from-top-2">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-card-foreground">Tên người dùng</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-4 flex items-center text-muted-foreground pointer-events-none">
                  <User className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  placeholder="Nhập tên người dùng"
                  className="w-full pl-11 pr-4 py-3 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all placeholder:text-muted-foreground"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-card-foreground">Email</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-4 flex items-center text-muted-foreground pointer-events-none">
                  <Mail className="w-5 h-5" />
                </span>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="Nhập email"
                  className="w-full pl-11 pr-4 py-3 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all placeholder:text-muted-foreground"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-card-foreground">Mật khẩu</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-4 flex items-center text-muted-foreground pointer-events-none">
                  <Lock className="w-5 h-5" />
                </span>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Nhập mật khẩu"
                  className="w-full pl-11 pr-4 py-3 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all placeholder:text-muted-foreground"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-teal-600 to-primary text-white font-semibold rounded-xl hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:opacity-70 disabled:cursor-not-allowed mt-4 shadow-shadow-glow"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  Đăng ký Teacher <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-border/50 text-center">
            <p className="text-sm text-muted-foreground">
              Đã có tài khoản?{' '}
              <Link to="/login" className="font-semibold text-teal-600 hover:text-teal-700 transition-colors">
                Đăng nhập
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegisterTeacherPage;