import React from 'react';
import {
  Search,
  Flame,
  Zap,
  Moon,
  Bell,
  LogOut,
  Users,
  LibraryBig,
  Palette,
  Globe
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Topbar({
  searchQuery,
  onSearchChange,
  selectedLanguage,
  onLanguageChange,
  user,
  onLogout
}) {
  const navigate = useNavigate();

  const getInitials = (name) => {
    if (!name) return 'MT';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <header className="h-20 bg-white border-b border-slate-100 flex items-center justify-between px-8 sticky top-0 z-20 shadow-sm">
      {/* Search Input */}
      <div className="relative w-full max-w-md">
        <span className="absolute inset-y-0 left-3.5 flex items-center text-slate-400">
          <Search className="w-4 h-4" />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search lessons, words, exams..."
          className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-700 transition-all placeholder:text-slate-400"
        />
      </div>

      {/* Right Action Icons & Badges */}
      <div className="flex items-center gap-4 sm:gap-6">
        {/* Daily Streak */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-full text-xs font-bold">
          <Flame className="w-4 h-4 fill-orange-500 text-orange-500" />
          <span>0</span>
        </div>

        {/* XP Points */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-bold">
          <Zap className="w-4 h-4 fill-blue-500 text-blue-500" />
          <span>0</span>
        </div>

        <div className="h-6 w-px bg-slate-200" />

        {/* Admin / Teacher Actions */}
        {user?.role === 'admin' && (
          <button
            onClick={() => navigate('/admin/users')}
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-all"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Tài khoản</span>
          </button>
        )}
        {user?.role === 'admin' && (
          <button
            onClick={() => navigate('/admin/content')}
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-all"
          >
            <LibraryBig className="w-3.5 h-3.5" />
            <span>Nội dung</span>
          </button>
        )}
        {user?.role === 'teacher' && (
          <button
            onClick={() => navigate('/teacher/create-content')}
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-all"
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Tạo bài tập</span>
          </button>
        )}

        {/* Dark Mode & Notifications */}
        <div className="flex items-center gap-2">
          <button className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 transition-colors">
            <Moon className="w-5 h-5" />
          </button>
          <button className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 transition-colors relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
          </button>
        </div>

        {/* User Profile Avatar & Logout */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 bg-indigo-100 text-indigo-700 font-bold rounded-full flex items-center justify-center text-sm shadow-inner"
            title={user?.username || 'User'}
          >
            {getInitials(user?.username)}
          </div>
          <button
            onClick={onLogout}
            title="Đăng xuất"
            className="p-2 text-slate-400 hover:text-red-600 rounded-full hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
