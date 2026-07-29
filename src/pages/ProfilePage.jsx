import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import {
  Mail, MapPin, CalendarDays, Crown, Flame, Zap, Trophy, Clock, BookOpen, Target, GraduationCap, Share2, Pencil, Medal, Notebook, Languages, Layers, Headphones, ArrowRight, BookMarked, Users, Star, Play, RefreshCw
} from 'lucide-react';

// Progress component
const ProgressBar = ({ value, colorClass = "bg-blue-600" }) => (
  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
    <div className={`h-full ${colorClass} rounded-full`} style={{ width: `${value}%` }} />
  </div>
);

// Progress Ring
const ProgressRing = ({ value, size = 150, strokeWidth = 12, children }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-slate-100" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" strokeDasharray={circumference} strokeDashoffset={offset} className="text-blue-600 transition-all duration-1000 ease-out" strokeLinecap="round" />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
};

const CourseCard = ({ course, isCompleted }) => {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className={`${course.headerBg} p-5 relative`}>
        <div className="flex justify-between items-start">
          <div>
            <span className="inline-block px-2.5 py-1 bg-white/60 rounded-full text-xs font-semibold text-slate-600 mb-2">
              {course.category}
            </span>
            <h3 className={`text-2xl font-black ${course.headerTitleColor}`}>
              {course.title}
            </h3>
          </div>
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shrink-0 shadow-sm">
            <BookMarked className={`w-6 h-6 ${course.headerTitleColor}`} />
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="flex justify-between items-start mb-3">
          <h4 className="font-bold text-slate-900 text-lg">{course.fullName}</h4>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${course.badgeColor}`}>
            {course.level}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm text-slate-500 font-medium mb-5">
          <span className="flex items-center gap-1.5"><BookOpen className="w-4 h-4" /> {course.lessons} lessons</span>
          <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> {course.users}</span>
          <span className="flex items-center gap-1.5 text-orange-500"><Star className="w-4 h-4 fill-orange-500" /> {course.rating}</span>
        </div>

        <div className="space-y-2 mb-5">
          <div className="flex justify-between text-sm font-bold text-slate-700">
            <span>{course.completedLessons}/{course.lessons} lessons</span>
            <span>{course.progress}%</span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full ${course.barColor} rounded-full`} style={{ width: `${course.progress}%` }} />
          </div>
        </div>

        <button className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-[#ffffff] font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
          {isCompleted ? <RefreshCw className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isCompleted ? 'Review' : 'Continue'}
        </button>
      </div>
    </div>
  );
};

const Toggle = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)} 
    className={`w-11 h-6 rounded-full flex items-center px-0.5 cursor-pointer shrink-0 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200 focus:ring-offset-1 ${
      checked ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-200 hover:bg-slate-300'
    }`}
  >
    <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out ${
      checked ? 'translate-x-5' : 'translate-x-0'
    }`}></div>
  </button>
);

export default function ProfilePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  
  // Raw user from localStorage (source of truth for initial values)
  const rawUser = JSON.parse(localStorage.getItem('user') || '{}');
  
  // ── Account Details Form State ──────────────────────────────────────
  const [accountForm, setAccountForm] = useState({
    fullName: rawUser.username || '',
    email: rawUser.email || '',
    username: rawUser.username ? '@' + rawUser.username.toLowerCase().replace(/\s+/g, '') : '',
  });
  const [accountErrors, setAccountErrors] = useState({});
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'success' | 'error'
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Track whether form has unsaved changes
  const initialAccountRef = {
    fullName: rawUser.username || '',
    email: rawUser.email || '',
    username: rawUser.username ? '@' + rawUser.username.toLowerCase().replace(/\s+/g, '') : '',
  };
  const isFormDirty =
    accountForm.fullName !== initialAccountRef.fullName ||
    accountForm.email !== initialAccountRef.email ||
    accountForm.username !== initialAccountRef.username;

  const handleAccountChange = (field) => (e) => {
    setAccountForm((prev) => ({ ...prev, [field]: e.target.value }));
    // Clear error for this field when user starts typing
    if (accountErrors[field]) {
      setAccountErrors((prev) => ({ ...prev, [field]: '' }));
    }
    // Reset save status when user edits
    if (saveStatus !== 'idle') setSaveStatus('idle');
  };

  const validateAccountForm = () => {
    const errors = {};
    if (!accountForm.fullName.trim()) errors.fullName = 'Full name is required.';
    if (!accountForm.email.trim()) {
      errors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountForm.email)) {
      errors.email = 'Please enter a valid email address.';
    }
    if (!accountForm.username.trim()) errors.username = 'Username is required.';
    return errors;
  };

  const handleSaveAccount = async () => {
    const errors = validateAccountForm();
    if (Object.keys(errors).length > 0) {
      setAccountErrors(errors);
      return;
    }

    setSaveStatus('saving');
    try {
      // ── Future API integration point ────────────────────────────────
      // When backend supports it, replace the block below with:
      // await api.put('/users/me', {
      //   username: accountForm.fullName,
      //   email: accountForm.email,
      // });
      // ───────────────────────────────────────────────────────────────

      // For now: update localStorage to persist changes across page refreshes
      await new Promise((resolve) => setTimeout(resolve, 600)); // simulate network latency
      const updatedUser = { ...rawUser, username: accountForm.fullName, email: accountForm.email };
      localStorage.setItem('user', JSON.stringify(updatedUser));

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err) {
      console.error('[ProfilePage] Save account failed:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // ── Learning Preferences State ──────────────────────────────────────
  const [dailyGoal, setDailyGoal] = useState(rawUser.dailyGoal || '50 XP');
  const [reminders, setReminders] = useState(rawUser.reminders !== false);
  const [streakAlerts, setStreakAlerts] = useState(rawUser.streakAlerts !== false);
  const [weeklyReport, setWeeklyReport] = useState(rawUser.weeklyReport === true);
  const [soundEffects, setSoundEffects] = useState(rawUser.soundEffects !== false);
  
  const user = {
    ...rawUser,
    plan: rawUser.plan || 'Free',
    level: rawUser.level || 0,
    handle: '@' + (rawUser.username || 'user').toLowerCase().replace(/\s+/g, ''),
    location: rawUser.location || null,
    joined: rawUser.joined || null,
    xp: rawUser.xp || 0,
    xpToNext: rawUser.xpToNext || 100,
    streak: rawUser.streak || 0,
    longestStreak: rawUser.longestStreak || 0,
    rank: rawUser.rank || 0,
    coursesDone: rawUser.coursesDone || 0,
    coursesInProgress: rawUser.coursesInProgress || 0,
  };

  const xpPercent = user.xpToNext > 0 ? Math.round((user.xp / user.xpToNext) * 100) : 0;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'courses', label: 'Courses' },
    { id: 'achievements', label: 'Achievements' },
    { id: 'settings', label: 'Settings' },
  ];

  const completedCourses = [
    {
      id: 1,
      category: 'Japanese dữ liệu tĩnh · JLPT',
      title: 'N5',
      fullName: 'JLPT N5 Foundations',
      level: 'Beginner',
      lessons: 30,
      completedLessons: 30,
      users: '22.8k',
      rating: 4.9,
      progress: 100,
      badgeColor: 'bg-emerald-100 text-emerald-700',
      headerBg: 'bg-[#FDF2F2]',
      headerTitleColor: 'text-rose-500',
      barColor: 'bg-emerald-500',
    }
  ];

  const inProgressCourses = [
    {
      id: 2,
      category: 'English · TOEIC',
      title: 'Target 900+',
      fullName: 'TOEIC Complete Prep',
      level: 'Intermediate',
      lessons: 48,
      completedLessons: 31,
      users: '24.5k',
      rating: 4.8,
      progress: 65,
      badgeColor: 'bg-blue-100 text-blue-700',
      headerBg: 'bg-[#EEF2FF]',
      headerTitleColor: 'text-blue-600',
      barColor: 'bg-blue-600',
    },
    {
      id: 3,
      category: 'English · IELTS',
      title: 'Band 7.5+',
      fullName: 'IELTS Academic Mastery',
      level: 'Advanced',
      lessons: 62,
      completedLessons: 12,
      users: '31.2k',
      rating: 4.9,
      progress: 19,
      badgeColor: 'bg-orange-100 text-orange-700',
      headerBg: 'bg-[#E8FAFA]',
      headerTitleColor: 'text-cyan-600',
      barColor: 'bg-blue-600',
    },
    {
      id: 4,
      category: 'English · Cambridge',
      title: 'CEFR C1',
      fullName: 'Cambridge C1 Advanced',
      level: 'Advanced',
      lessons: 40,
      completedLessons: 8,
      users: '12.4k',
      rating: 4.6,
      progress: 20,
      badgeColor: 'bg-orange-100 text-orange-700',
      headerBg: 'bg-[#EAF6ED]',
      headerTitleColor: 'text-emerald-600',
      barColor: 'bg-blue-600',
    }
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const getInitials = (name) => {
    if (!name) return 'MT';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const activityIcons = {
    grammar: Notebook,
    exam: Languages,
    flashcard: Layers,
    listening: Headphones,
    achievement: Medal,
  };

  return (
    <DashboardLayout user={user} onLogout={handleLogout}>
      <div className="space-y-6">
        {/* Profile Header */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="h-28 bg-blue-600 w-full" />
            <div className="px-6 pb-6 -mt-12 sm:-mt-14 sm:flex sm:items-end sm:justify-between">
              <div className="flex flex-col sm:flex-row sm:items-end gap-5">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-[#ffffff] bg-indigo-100 flex items-center justify-center text-3xl font-bold text-indigo-700 shadow-sm shrink-0 relative z-10">
                  {getInitials(user.username)}
                </div>
                <div className="pb-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">{user.username || 'Mai Tanaka'}</h1>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border border-slate-200 text-slate-600 bg-white">
                      Level {user.level}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {user.email || 'No email provided'}</span>
                  </div>
                </div>
              </div>
              <div className="mt-5 sm:mt-0 flex flex-wrap items-center gap-2 relative z-10">
                <button className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-sm font-medium transition-colors">
                  <Pencil className="w-4 h-4" /> Edit profile
                </button>
              </div>
            </div>
          </div>

          {/* Key Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex gap-4 items-center hover:-translate-y-1 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Zap className="w-6 h-6 text-blue-600 fill-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500 font-medium">XP Points</p>
                <p className="text-2xl font-bold text-slate-900">{user.xp.toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-0.5">{(user.xpToNext - user.xp).toLocaleString()} XP to next</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex gap-4 items-center hover:-translate-y-1 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                <Flame className="w-6 h-6 text-orange-500 fill-orange-500" />
              </div>
              <div>
                <p className="text-sm text-slate-500 font-medium">Learning Streak</p>
                <p className="text-2xl font-bold text-slate-900">{user.streak} days</p>
                <p className="text-xs text-slate-400 mt-0.5">Best: {user.longestStreak} days</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex gap-4 items-center hover:-translate-y-1 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                <Trophy className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-slate-500 font-medium">Rank</p>
                <p className="text-2xl font-bold text-slate-900">#{user.rank}</p>
                <p className="text-xs text-slate-400 mt-0.5">Sapphire League</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex gap-4 items-center hover:-translate-y-1 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <GraduationCap className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500 font-medium">Courses Done</p>
                <p className="text-2xl font-bold text-slate-900">{user.coursesDone}</p>
                <p className="text-xs text-slate-400 mt-0.5">{user.coursesInProgress} in progress</p>
              </div>
            </div>
          </div>

          {/* Level & Overall progress */}
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-slate-900">Learning Progress</h2>
                <p className="text-sm text-slate-500 mt-1">Level {user.level} · {xpPercent}% to the next level</p>
              </div>

              <div className="space-y-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-500 font-medium">{user.xp.toLocaleString()} / {user.xpToNext.toLocaleString()} XP</span>
                    <span className="font-bold text-slate-700">Level {user.level}</span>
                  </div>
                  <ProgressBar value={xpPercent} />
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-500 font-medium">English</span>
                    <span className="font-bold text-slate-700">{rawUser.englishProgress || 0}%</span>
                  </div>
                  <ProgressBar value={rawUser.englishProgress || 0} colorClass="bg-blue-600" />
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-500 font-medium">Japanese</span>
                    <span className="font-bold text-slate-700">{rawUser.japaneseProgress || 0}%</span>
                  </div>
                  <ProgressBar value={rawUser.japaneseProgress || 0} colorClass="bg-emerald-500" />
                </div>

                <hr className="border-slate-100" />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xl font-bold text-slate-900">{rawUser.studyMinutesToday || 0} min</p>
                    <p className="text-xs text-slate-500 font-medium">Today</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-900">{rawUser.weeklyGoalProgress || 0}%</p>
                    <p className="text-xs text-slate-500 font-medium">Weekly goal</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-900">{rawUser.badgesCount || 0}</p>
                    <p className="text-xs text-slate-500 font-medium">Badges</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center justify-center">
              <h2 className="text-lg font-bold text-slate-900 w-full mb-6 text-left">Overall Progress</h2>
              <ProgressRing value={rawUser.overallProgress || 0} size={180}>
                <span className="text-4xl font-bold text-slate-900">{rawUser.overallProgress || 0}%</span>
                <span className="text-sm font-medium text-slate-500 mt-1">Path complete</span>
              </ProgressRing>
              <button className="mt-8 w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-blue-600 rounded-xl font-medium transition-colors">
                View learning path <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-slate-200">
            <nav className="flex gap-6 overflow-x-auto no-scrollbar">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="mb-6">
                  <h2 className="text-lg font-bold text-slate-900">Statistics</h2>
                  <p className="text-sm text-slate-500 mt-1">All-time learning numbers</p>
                </div>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[
                    { icon: BookOpen, label: 'Lessons completed', value: rawUser.lessonsCompleted || 0 },
                    { icon: Layers, label: 'Words learned', value: rawUser.wordsLearned || 0 },
                    { icon: Clock, label: 'Total study time', value: `${rawUser.totalStudyHours || 0} h` },
                    { icon: Target, label: 'Average accuracy', value: `${rawUser.averageAccuracy || 0}%` },
                    { icon: Flame, label: 'Perfect goal days', value: rawUser.perfectGoalDays || 0 },
                  ].map((stat, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <stat.icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-bold text-slate-900 leading-tight">{stat.value}</p>
                        <p className="text-xs text-slate-500 font-medium truncate">{stat.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-6">Recent Activity</h2>
                <div className="space-y-5">
                  {(rawUser.activities || []).length > 0 ? (rawUser.activities || []).map((activity) => {
                    const Icon = activityIcons[activity.type] || Notebook;
                    return (
                      <div key={activity.id} className="flex gap-3">
                        <div className="w-8 h-8 rounded-full border border-slate-100 bg-slate-50 flex items-center justify-center text-blue-600 shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 leading-tight mb-0.5">{activity.title}</p>
                          <p className="text-xs text-slate-500">{activity.course} · {activity.time}</p>
                        </div>
                        <span className="inline-flex h-6 items-center px-2 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold shrink-0">
                          +{activity.xp}
                        </span>
                      </div>
                    )
                  }) : (
                    <p className="text-sm text-slate-500 text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">No recent activity found.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'courses' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-4">Completed Courses (1)</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {completedCourses.map((c) => (
                    <CourseCard key={c.id} course={c} isCompleted={true} />
                  ))}
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-4">In Progress (7)</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {inProgressCourses.map((c) => (
                    <CourseCard key={c.id} course={c} isCompleted={false} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="grid lg:grid-cols-2 gap-6">
              {/* ── Account Details ── */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-8">
                <h2 className="text-xl font-bold text-slate-900 mb-1">Account Details</h2>
                <p className="text-sm text-slate-500 mb-6">Update your personal information</p>

                <div className="space-y-4">
                  {/* Full name */}
                  <div className="space-y-1.5">
                    <label htmlFor="acc-fullname" className="text-sm font-medium text-slate-700">Full name</label>
                    <input
                      id="acc-fullname"
                      type="text"
                      value={accountForm.fullName}
                      onChange={handleAccountChange('fullName')}
                      placeholder="Your full name"
                      className={`w-full px-4 py-2.5 bg-white border rounded-xl text-sm font-medium text-slate-900 transition-all focus:outline-none focus:ring-2 ${
                        accountErrors.fullName
                          ? 'border-red-300 focus:ring-red-100 focus:border-red-400'
                          : 'border-slate-200 hover:border-slate-300 focus:ring-blue-100 focus:border-blue-400'
                      }`}
                    />
                    {accountErrors.fullName && (
                      <p className="text-xs text-red-500 mt-1">{accountErrors.fullName}</p>
                    )}
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label htmlFor="acc-email" className="text-sm font-medium text-slate-700">Email address</label>
                    <input
                      id="acc-email"
                      type="email"
                      value={accountForm.email}
                      onChange={handleAccountChange('email')}
                      placeholder="your@email.com"
                      className={`w-full px-4 py-2.5 bg-white border rounded-xl text-sm font-medium text-slate-900 transition-all focus:outline-none focus:ring-2 ${
                        accountErrors.email
                          ? 'border-red-300 focus:ring-red-100 focus:border-red-400'
                          : 'border-slate-200 hover:border-slate-300 focus:ring-blue-100 focus:border-blue-400'
                      }`}
                    />
                    {accountErrors.email && (
                      <p className="text-xs text-red-500 mt-1">{accountErrors.email}</p>
                    )}
                  </div>

                  {/* Username */}
                  <div className="space-y-1.5">
                    <label htmlFor="acc-username" className="text-sm font-medium text-slate-700">Username</label>
                    <input
                      id="acc-username"
                      type="text"
                      value={accountForm.username}
                      onChange={handleAccountChange('username')}
                      placeholder="@username"
                      className={`w-full px-4 py-2.5 bg-white border rounded-xl text-sm font-medium text-slate-900 transition-all focus:outline-none focus:ring-2 ${
                        accountErrors.username
                          ? 'border-red-300 focus:ring-red-100 focus:border-red-400'
                          : 'border-slate-200 hover:border-slate-300 focus:ring-blue-100 focus:border-blue-400'
                      }`}
                    />
                    {accountErrors.username && (
                      <p className="text-xs text-red-500 mt-1">{accountErrors.username}</p>
                    )}
                  </div>

                  {/* Save feedback */}
                  {saveStatus === 'success' && (
                    <p className="text-sm text-emerald-600 font-medium bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
                      ✓ Changes saved successfully.
                    </p>
                  )}
                  {saveStatus === 'error' && (
                    <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                      ✗ Failed to save. Please try again.
                    </p>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={handleSaveAccount}
                      disabled={!isFormDirty || saveStatus === 'saving'}
                      className={`px-5 py-2.5 text-sm font-bold rounded-xl transition-all ${
                        !isFormDirty || saveStatus === 'saving'
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-[#ffffff] shadow-sm hover:shadow-blue-200'
                      }`}
                    >
                      {saveStatus === 'saving' ? 'Saving…' : 'Save changes'}
                    </button>
                    <button
                      onClick={() => setShowPasswordModal(true)}
                      className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 text-sm font-medium rounded-xl transition-all"
                    >
                      Change password
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Change Password Modal ── */}
              {showPasswordModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowPasswordModal(false)}>
                  <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">Change Password</h3>
                    <p className="text-sm text-slate-500 mb-6">Password update requires backend support — not yet available.</p>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Current password</label>
                        <input type="password" disabled placeholder="••••••••" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-400 cursor-not-allowed" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">New password</label>
                        <input type="password" disabled placeholder="••••••••" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-400 cursor-not-allowed" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Confirm new password</label>
                        <input type="password" disabled placeholder="••••••••" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-400 cursor-not-allowed" />
                      </div>
                    </div>
                    <p className="mt-5 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                      ⚠ Password change API is not yet implemented on the backend. This modal is a placeholder — connect to <code className="font-mono">PUT /users/me/password</code> when ready.
                    </p>
                    <div className="flex justify-end gap-3 mt-6">
                      <button onClick={() => setShowPasswordModal(false)} className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl transition-colors">
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Learning Preferences */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-8">
                <h2 className="text-xl font-bold text-slate-900 mb-1">Learning Preferences</h2>
                <p className="text-sm text-slate-500 mb-6">Tune your daily study routine</p>
                
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-3">Daily goal</p>
                    <div className="flex flex-wrap gap-2.5">
                      {['15 min', '30 min', '50 XP', '100 XP'].map(goal => (
                        <button 
                          key={goal}
                          onClick={() => setDailyGoal(goal)}
                          className={`px-4 py-2 text-sm font-medium rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-blue-100 ${
                            dailyGoal === goal 
                              ? 'bg-blue-600 text-[#ffffff] font-bold shadow-sm hover:bg-blue-700'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100'
                          }`}>
                          {goal}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <hr className="border-slate-100" />
                  
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Study reminders</p>
                      <p className="text-xs text-slate-500 mt-0.5">A daily nudge at your usual study time</p>
                    </div>
                    <Toggle checked={reminders} onChange={setReminders} />
                  </div>
                  
                  <hr className="border-slate-100" />
                  
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Streak alerts</p>
                      <p className="text-xs text-slate-500 mt-0.5">Warn me before I lose my streak</p>
                    </div>
                    <Toggle checked={streakAlerts} onChange={setStreakAlerts} />
                  </div>
                  
                  <hr className="border-slate-100" />
                  
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Weekly progress report</p>
                      <p className="text-xs text-slate-500 mt-0.5">Email summary every Sunday evening</p>
                    </div>
                    <Toggle checked={weeklyReport} onChange={setWeeklyReport} />
                  </div>
                  
                  <hr className="border-slate-100" />
                  
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Sound effects</p>
                      <p className="text-xs text-slate-500 mt-0.5">Play audio feedback during exercises</p>
                    </div>
                    <Toggle checked={soundEffects} onChange={setSoundEffects} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab !== 'overview' && activeTab !== 'courses' && activeTab !== 'settings' && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                <Clock className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Coming Soon</h3>
              <p className="text-slate-500 max-w-sm mx-auto">
                The <span className="capitalize">{activeTab}</span> section is currently under development. Check back later for updates!
              </p>
            </div>
          )}


      </div>
    </DashboardLayout>
  );
}
