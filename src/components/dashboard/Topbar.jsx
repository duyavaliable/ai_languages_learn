import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  LogOut,
  Users,
  LibraryBig,
  User
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Topbar({
  searchQuery = '',
  onSearchChange = () => {},
  selectedLanguage = 'en',
  onLanguageChange = () => {},
  user,
  onLogout = () => {}
}) {
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

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
        {/* Chuyen ngon ngu. Thay cho huy hieu streak/XP cua ban mau: du an
            khong do hai chi so do, hien so 0 co dinh la hua hen thu khong co.
            Nut nay doi CA danh sach ky nang o thanh ben (Anh: doc/viet,
            Nhat: ngu phap/doc hieu) lan bo loc bai tap. */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-full" role="group" aria-label="Chọn ngôn ngữ">
          {[['en', 'EN'], ['ja', 'JP']].map(([code, label]) => (
            <button
              key={code}
              onClick={() => onLanguageChange(code)}
              aria-pressed={selectedLanguage === code}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                selectedLanguage === code
                  ? 'bg-white text-blue-600 shadow-sm ring-1 ring-blue-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-slate-200" />

        {/* Admin actions (vai trò teacher đã bỏ) */}
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

        {/* Đã bỏ nút thông báo: chỉ là hình trang trí (chấm đỏ cố định), hệ thống không có thông báo nào. */}

        {/* User Profile Avatar & Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-10 h-10 bg-indigo-100 text-indigo-700 font-bold rounded-full flex items-center justify-center text-sm shadow-inner hover:ring-2 hover:ring-indigo-300 transition-all focus:outline-none"
            title={user?.username || 'User'}
          >
            {getInitials(user?.username)}
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 z-50 overflow-hidden transform opacity-100 scale-100 transition-all origin-top-right">
              <div className="px-4 py-2.5 border-b border-slate-100 mb-1">
                <p className="text-sm font-semibold text-slate-800 truncate">{user?.username || 'User'}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email || 'user@example.com'}</p>
              </div>
              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  navigate('/profile');
                }}
                className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-2.5 transition-colors"
              >
                <User className="w-4 h-4" />
                <span className="font-medium">Hồ sơ của tôi</span>
              </button>
              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  onLogout();
                }}
                className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-red-50 hover:text-red-600 flex items-center gap-2.5 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="font-medium">Đăng xuất</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
