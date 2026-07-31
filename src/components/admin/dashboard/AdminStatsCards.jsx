import React from 'react';
import { Users, GraduationCap, BookOpen, Sparkles } from 'lucide-react';

export default function AdminStatsCards({ totalUsers = 0, teachers = 0, courses = 0, exercises = 0 }) {
  const cards = [
    {
      title: 'Total Users',
      value: totalUsers,
      icon: Users,
      color: 'blue',
      bgClass: 'bg-blue-50 dark:bg-blue-900/20',
      textClass: 'text-blue-600 dark:text-blue-400'
    },
    {
      title: 'Teachers',
      value: teachers,
      icon: GraduationCap,
      color: 'teal',
      bgClass: 'bg-teal-50 dark:bg-teal-900/20',
      textClass: 'text-teal-600 dark:text-teal-400'
    },
    {
      title: 'Courses',
      value: courses,
      icon: BookOpen,
      color: 'emerald',
      bgClass: 'bg-emerald-50 dark:bg-emerald-900/20',
      textClass: 'text-emerald-600 dark:text-emerald-400'
    },
    {
      title: 'Exercises',
      value: exercises,
      icon: Sparkles,
      color: 'purple',
      bgClass: 'bg-purple-50 dark:bg-purple-900/20',
      textClass: 'text-purple-600 dark:text-purple-400'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="bg-admin-card text-admin-card-foreground p-6 rounded-2xl shadow-sm border border-admin-border flex items-center gap-4 transition-transform hover:-translate-y-1 duration-300"
          >
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${card.bgClass} ${card.textClass}`}>
              <Icon className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-bold text-admin-muted-foreground uppercase tracking-wider mb-1">
                {card.title}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black">{card.value}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
