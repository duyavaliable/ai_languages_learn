import React from 'react';
import { TrendingUp, Clock, CalendarCheck } from 'lucide-react';

const weekDays = [
  { day: 'Mon', height: 'h-[5%]', label: '0m' },
  { day: 'Tue', height: 'h-[5%]', label: '0m' },
  { day: 'Wed', height: 'h-[5%]', label: '0m' },
  { day: 'Thu', height: 'h-[5%]', label: '0m' },
  { day: 'Fri', height: 'h-[5%]', label: '0m' },
  { day: 'Sat', height: 'h-[5%]', label: '0m' },
  { day: 'Sun', height: 'h-[5%]', label: '0m' },
];

export default function WeeklyProgress() {
  return (
    <section className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Weekly Progress</h2>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">Minutes studied this week</p>
        </div>
        <span className="text-xs bg-slate-100 text-slate-500 px-3 py-1 rounded-full font-bold flex items-center gap-1">
          <TrendingUp className="w-3.5 h-3.5" />
          0%
        </span>
      </div>

      {/* Bar Chart Visualization */}
      <div className="pt-8 pb-4">
        <div className="h-44 flex items-end justify-between px-3 gap-2">
          {weekDays.map((item, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-2 group relative">
              {/* Tooltip */}
              <div className="absolute -top-9 bg-slate-800 text-[#ffffff] text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 shadow">
                {item.label}
              </div>
              {/* Bar */}
              <div
                className={`w-full max-w-[40px] rounded-t-xl transition-all duration-300 cursor-pointer bg-slate-100 hover:bg-blue-100 ${item.height}`}
              />
              {/* Day Label */}
              <span className="text-[11px] font-bold text-slate-400 mt-2">{item.day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Metrics */}
      <div className="mt-6 flex flex-wrap items-center justify-between pt-5 border-t border-slate-100 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-500">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">0 min</p>
            <p className="text-[11px] text-slate-400 font-medium">Today</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-500">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">0m</p>
            <p className="text-[11px] text-slate-400 font-medium">This week</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-500">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">0 / 7 days</p>
            <p className="text-[11px] text-slate-400 font-medium">Goal met</p>
          </div>
        </div>
      </div>
    </section>
  );
}
