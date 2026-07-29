import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  Headphones,
  Mic2,
  PenTool,
  Library,
  Sparkles,
  Layers
} from 'lucide-react';

const practiceItems = [
  { key: 'vocabulary', label: 'Vocabulary', icon: BookOpen },
  { key: 'listening', label: 'Listening', icon: Headphones },
  { key: 'speaking', label: 'Speaking', icon: Mic2 },
  { key: 'writing', label: 'Writing', icon: PenTool },
  { key: 'reading', label: 'Reading', icon: Library },
  { key: 'flashcards', label: 'Flashcards', icon: Layers },
];

export default function Sidebar({ selectedSkill, onSelectSkill, onResetOverview }) {
  const navigate = useNavigate();
  const location = useLocation();

  const isOnDashboard = location.pathname === '/' || location.pathname === '/dashboard';

  // Dashboard is active when on homepage with no skill selected
  const isDashboardActive = isOnDashboard && !selectedSkill;

  const handleDashboardClick = () => {
    if (isOnDashboard && onResetOverview) {
      // We're on the dashboard — just reset to overview
      onResetOverview();
    } else {
      // Navigate to homepage/dashboard
      navigate('/', { state: { selectedSkill: '' } });
    }
  };

  const handleSkillClick = (skillKey) => {
    if (isOnDashboard && onSelectSkill) {
      // We're on the dashboard — use the SPA handler
      onSelectSkill(skillKey);
    } else {
      // Navigate to dashboard with the skill pre-selected
      navigate('/', { state: { selectedSkill: skillKey } });
    }
  };

  return (
    <aside className="w-64 bg-white border-r border-slate-100 flex flex-col fixed left-0 top-0 h-full z-30 shadow-sm">
      {/* Brand / Logo */}
      <div className="p-6 flex items-center gap-3 border-b border-slate-50">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-[#ffffff] shadow-md shadow-blue-500/20">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <span className="text-xl font-bold text-slate-900 tracking-tight block leading-tight">Lingua</span>
          <span className="text-[11px] text-slate-400 font-medium">Learn &amp; Practice</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-8 overflow-y-auto">
        {/* Overview Section */}
        <div>
          <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Overview</p>
          <div className="space-y-1">
            <button
              onClick={handleDashboardClick}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
                isDashboardActive
                  ? 'bg-blue-50 text-blue-600 font-semibold shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={handleDashboardClick}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 rounded-xl font-medium text-sm transition-all duration-200"
            >
              <BookOpen className="w-5 h-5" />
              <span>Courses</span>
            </button>
          </div>
        </div>

        {/* Practice Section */}
        <div>
          <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Practice</p>
          <div className="space-y-1">
            {practiceItems.map((item) => {
              const Icon = item.icon;
              // Active if on dashboard with this skill selected, OR navigated here with state
              const isActive = isOnDashboard && selectedSkill === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => handleSkillClick(item.key)}
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
        </div>
      </nav>
    </aside>
  );
}
