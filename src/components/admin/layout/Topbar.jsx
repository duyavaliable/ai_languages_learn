import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Moon,
  Bell,
  LogOut,
  User,
  Sun,
  Settings
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../../contexts/ThemeProvider';

export default function Topbar({
  searchQuery = '',
  onSearchChange = () => {},
  user,
  onLogout = () => {}
}) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
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
    if (!name) return 'AD';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <header className="h-20 bg-admin-card border-b border-admin-border flex items-center justify-between px-8 sticky top-0 z-20 shadow-sm">
      {/* Search Input */}
      <div className="relative w-full max-w-md">
        <span className="absolute inset-y-0 left-3.5 flex items-center text-admin-muted-foreground">
          <Search className="w-4 h-4" />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search..."
          className="w-full pl-10 pr-4 py-2 bg-admin-muted border border-admin-border rounded-full focus:outline-none focus:ring-2 focus:ring-admin-primary/20 focus:border-admin-primary text-sm text-admin-foreground transition-all placeholder:text-admin-muted-foreground"
        />
      </div>

      {/* Right Action Icons & Badges */}
      <div className="flex items-center gap-4 sm:gap-6">
        {/* Dark Mode & Notifications */}
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleTheme}
            className="p-2 text-admin-muted-foreground hover:text-admin-foreground rounded-full hover:bg-admin-muted transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button className="p-2 text-admin-muted-foreground hover:text-admin-foreground rounded-full hover:bg-admin-muted transition-colors relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-admin-danger rounded-full ring-2 ring-admin-background" />
          </button>
        </div>

        {/* User Profile Avatar & Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-10 h-10 bg-admin-primary/10 text-admin-primary font-bold rounded-full flex items-center justify-center text-sm shadow-inner hover:ring-2 hover:ring-admin-primary/30 transition-all focus:outline-none"
            title={user?.username || 'Admin'}
          >
            {getInitials(user?.username)}
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-admin-card rounded-xl shadow-lg border border-admin-border py-1.5 z-50 overflow-hidden transform opacity-100 scale-100 transition-all origin-top-right">
              <div className="px-4 py-2.5 border-b border-admin-border mb-1">
                <p className="text-sm font-semibold text-admin-card-foreground truncate">{user?.username || 'Admin'}</p>
                <p className="text-xs text-admin-muted-foreground truncate">{user?.email || 'admin@example.com'}</p>
              </div>
              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  navigate('/admin/profile');
                }}
                className="w-full text-left px-4 py-2 text-sm text-admin-muted-foreground hover:bg-admin-muted hover:text-admin-primary flex items-center gap-2.5 transition-colors"
              >
                <User className="w-4 h-4" />
                <span className="font-medium">View Profile</span>
              </button>
              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  navigate('/admin/settings');
                }}
                className="w-full text-left px-4 py-2 text-sm text-admin-muted-foreground hover:bg-admin-muted hover:text-admin-primary flex items-center gap-2.5 transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span className="font-medium">Settings</span>
              </button>
              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  onLogout();
                }}
                className="w-full text-left px-4 py-2 text-sm text-admin-muted-foreground hover:bg-admin-danger-soft hover:text-admin-danger flex items-center gap-2.5 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="font-medium">Log out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
