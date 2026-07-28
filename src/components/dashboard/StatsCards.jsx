import React from 'react';
import { CheckCircle2, Flame, Zap, Trophy } from 'lucide-react';

export default function StatsCards() {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Card 1: Today's Goal */}
      <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="text-right">
            <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Today's Goal</p>
            <p className="text-2xl font-bold text-slate-800">0/50 XP</p>
          </div>
        </div>
        <div className="w-full bg-slate-100 h-2 rounded-full mb-1.5 overflow-hidden">
          <div className="bg-blue-500 h-full w-[0%] rounded-full transition-all duration-500" />
        </div>
        <p className="text-[11px] text-slate-500 font-medium">50 XP to go</p>
      </div>

      {/* Card 2: Daily Streak */}
      <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center">
            <Flame className="w-6 h-6 fill-orange-500" />
          </div>
          <div className="text-right">
            <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Daily Streak</p>
            <p className="text-2xl font-bold text-slate-800">0 days</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 font-medium mt-auto">Personal best: 0</p>
      </div>

      {/* Card 3: XP Today */}
      <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center">
            <Zap className="w-6 h-6 fill-emerald-500" />
          </div>
          <div className="text-right">
            <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">XP Today</p>
            <p className="text-2xl font-bold text-slate-800">0</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 font-medium mt-auto">0% vs yesterday</p>
      </div>

      {/* Card 4: Current Level */}
      <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 bg-sky-50 text-sky-500 rounded-full flex items-center justify-center">
            <Trophy className="w-6 h-6 text-sky-500" />
          </div>
          <div className="text-right">
            <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Current Level</p>
            <p className="text-2xl font-bold text-slate-800">Level 1</p>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 font-medium">0 / 10,000 XP</p>
      </div>
    </section>
  );
}
