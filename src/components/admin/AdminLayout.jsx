import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, LibraryBig, ShieldCheck, Sparkles, Users } from 'lucide-react';

/**
 * Khung chung của các trang quản trị (Tài khoản, Nội dung).
 *
 * Dựng theo ĐÚNG ngôn ngữ thiết kế của trang học (Sidebar + Topbar): nền
 * slate-50, thẻ trắng viền slate-100, màu nhấn blue-600, icon lucide. Trước
 * đây hai trang quản trị tự viết style inline với gradient tím riêng nên
 * trông như một ứng dụng khác.
 */
const NAV = [
  { path: '/admin/users', label: 'Tài khoản', icon: Users },
  { path: '/admin/content', label: 'Nội dung', icon: LibraryBig }
];

export default function AdminLayout({ title, subtitle, actions, children }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex">
      <aside className="w-64 bg-white border-r border-slate-100 flex flex-col fixed left-0 top-0 h-full z-30 shadow-sm">
        <div className="p-6 flex items-center gap-3 border-b border-slate-50">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-[#ffffff] shadow-md shadow-blue-500/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xl font-bold text-slate-900 tracking-tight block leading-tight">Lingua</span>
            <span className="text-[11px] text-slate-400 font-medium">Quản trị hệ thống</span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 overflow-y-auto">
          <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Quản trị</p>
          <div className="space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              // Trang sửa bài (/admin/exercises/:id/edit) thuộc mục Nội dung.
              const isActive = pathname === item.path
                || (item.path === '/admin/content' && pathname.startsWith('/admin/exercises/'));
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-blue-600 text-[#ffffff] font-semibold shadow-md shadow-blue-500/25'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="p-4 border-t border-slate-50">
          {/* Trang chủ tự khôi phục ngôn ngữ / kỹ năng đã chọn (sessionStorage). */}
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Về trang học</span>
          </button>
        </div>
      </aside>

      <main className="ml-64 flex-1 flex flex-col min-w-0">
        <header className="h-20 bg-white border-b border-slate-100 flex items-center justify-between px-8 sticky top-0 z-20 shadow-sm">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 truncate">{title}</h1>
            {subtitle && <p className="text-xs text-slate-400 font-medium truncate">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3">
            {actions}
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5" />
              {user.username || 'admin'}
            </span>
          </div>
        </header>

        <div className="p-8 max-w-7xl w-full mx-auto space-y-6 flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}

/** Thông báo thành công / lỗi dùng chung cho các trang quản trị. */
export function AdminNotice({ data }) {
  if (!data) return null;
  const ok = data.type === 'success';
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${ok ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
      {data.text}
    </div>
  );
}

/** Ô số liệu nhỏ ở đầu trang. */
export function StatTile({ icon: Icon, label, value, color = 'text-blue-600 bg-blue-50' }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`p-2.5 rounded-xl ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      </div>
    </div>
  );
}
