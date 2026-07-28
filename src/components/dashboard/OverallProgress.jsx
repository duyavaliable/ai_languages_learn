import React from 'react';

export default function OverallProgress() {
  return (
    <section className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
      <h2 className="text-xl font-bold text-slate-900 mb-6">Overall Progress</h2>

      {/* Donut Progress Chart */}
      <div className="flex justify-center mb-8">
        <div className="relative w-36 h-36 rounded-full flex items-center justify-center shadow-inner" style={{
          background: 'conic-gradient(#e2e8f0 100%, #e2e8f0 0)'
        }}>
          {/* Inner Circle cutout */}
          <div className="w-28 h-28 bg-white rounded-full flex flex-col items-center justify-center shadow-sm">
            <span className="text-3xl font-black text-slate-800 tracking-tight">0%</span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Path complete</span>
          </div>
        </div>
      </div>

      {/* Skill / Course Progress Bars */}
      <div className="space-y-5">
        <div>
          <div className="flex justify-between text-sm font-bold mb-2">
            <span className="text-slate-600">English (IELTS)</span>
            <span className="text-slate-900">0%</span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div className="bg-blue-600 h-full w-[0%] rounded-full transition-all duration-500" />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm font-bold mb-2">
            <span className="text-slate-600">Japanese (JLPT N3)</span>
            <span className="text-slate-900">0%</span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full w-[0%] rounded-full transition-all duration-500" />
          </div>
        </div>
      </div>
    </section>
  );
}
