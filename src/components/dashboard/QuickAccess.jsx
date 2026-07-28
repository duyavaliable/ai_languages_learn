import React from 'react';
import {
  BookOpen,
  Headphones,
  Library,
  Mic2,
  PenTool,
  Layers
} from 'lucide-react';

const quickItems = [
  {
    key: 'vocabulary',
    label: 'Vocabulary',
    icon: BookOpen,
    bg: 'bg-emerald-50 text-emerald-600 group-hover:border-emerald-200',
    iconBg: 'bg-emerald-50 text-emerald-600'
  },
  {
    key: 'listening',
    label: 'Listening',
    icon: Headphones,
    bg: 'bg-orange-50 text-orange-600 group-hover:border-orange-200',
    iconBg: 'bg-orange-50 text-orange-600'
  },
  {
    key: 'reading',
    label: 'Reading',
    icon: Library,
    bg: 'bg-pink-50 text-pink-600 group-hover:border-pink-200',
    iconBg: 'bg-pink-50 text-pink-600'
  },
  {
    key: 'speaking',
    label: 'Speaking',
    icon: Mic2,
    bg: 'bg-blue-50 text-blue-600 group-hover:border-blue-200',
    iconBg: 'bg-blue-50 text-blue-600'
  },
  {
    key: 'writing',
    label: 'Writing',
    icon: PenTool,
    bg: 'bg-slate-100 text-slate-700 group-hover:border-slate-300',
    iconBg: 'bg-slate-100 text-slate-700'
  },
  {
    key: 'flashcards',
    label: 'Flashcards',
    icon: Layers,
    bg: 'bg-indigo-50 text-indigo-600 group-hover:border-indigo-200',
    iconBg: 'bg-indigo-50 text-indigo-600'
  }
];

export default function QuickAccess({ onSelectSkill }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-slate-900">Quick Access</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {quickItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => onSelectSkill(item.key)}
              className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center gap-3 group hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 text-center"
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform ${item.iconBg}`}>
                <Icon className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold text-slate-700">{item.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
