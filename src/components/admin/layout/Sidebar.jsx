import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  PenTool,
  Users,
  LibraryBig,
  Sparkles
} from 'lucide-react';

export default function Sidebar({ user }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="w-64 bg-admin-card border-r border-admin-border flex flex-col fixed left-0 top-0 h-full z-30 shadow-sm">
      {/* Brand / Logo */}
      <div className="p-6 flex items-center gap-3 border-b border-admin-border">
        <div className="w-10 h-10 bg-admin-primary rounded-xl flex items-center justify-center text-admin-primary-foreground shadow-md shadow-admin-primary/20">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <span className="text-xl font-bold text-admin-card-foreground tracking-tight block leading-tight">Lingua</span>
          <span className="text-[11px] text-admin-muted-foreground font-medium">Admin System</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-8 overflow-y-auto">
        {/* Main Section */}
        <div>
          <p className="px-3 text-xs font-semibold text-admin-muted-foreground uppercase tracking-wider mb-3">Main</p>
          <div className="space-y-1">
            <button
              onClick={() => navigate('/admin')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
                location.pathname === '/admin' || location.pathname === '/admin/'
                  ? 'bg-admin-primary/10 text-admin-primary font-semibold shadow-sm'
                  : 'text-admin-muted-foreground hover:bg-admin-muted hover:text-admin-card-foreground'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => navigate('/admin/content')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
                location.pathname.startsWith('/admin/content')
                  ? 'bg-admin-primary/10 text-admin-primary font-semibold shadow-sm'
                  : 'text-admin-muted-foreground hover:bg-admin-muted hover:text-admin-card-foreground'
              }`}
            >
              <BookOpen className="w-5 h-5" />
              <span>Courses</span>
            </button>

            <button
              onClick={() => navigate('/admin/exercises')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
                location.pathname.startsWith('/admin/exercises')
                  ? 'bg-admin-primary/10 text-admin-primary font-semibold shadow-sm'
                  : 'text-admin-muted-foreground hover:bg-admin-muted hover:text-admin-card-foreground'
              }`}
            >
              <PenTool className="w-5 h-5" />
              <span>Exercises</span>
            </button>
          </div>
        </div>
      </nav>
    </aside>
  );
}
