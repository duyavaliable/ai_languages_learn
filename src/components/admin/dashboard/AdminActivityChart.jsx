import React from 'react';

export default function AdminActivityChart() {
  return (
    <div className="bg-admin-card border border-admin-border rounded-3xl p-6 md:p-8 flex flex-col h-[400px]">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-xl font-bold text-admin-card-foreground">System Activity</h2>
          <p className="text-sm text-admin-muted-foreground mt-1">Platform engagement this week</p>
        </div>
        <div className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-sm font-semibold rounded-full flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </div>
      </div>

      <div className="flex-1 flex items-end justify-between gap-2 relative">
        {/* Placeholder chart bars */}
        {[30, 45, 25, 60, 40, 75, 50].map((height, idx) => (
          <div key={idx} className="w-full relative group h-full flex items-end justify-center">
            <div 
              className="w-full max-w-[40px] bg-blue-100 dark:bg-blue-900/30 rounded-t-lg transition-all duration-300 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/40 relative flex flex-col justify-end"
              style={{ height: `${height}%` }}
            >
              <div 
                className="w-full bg-blue-500 rounded-t-lg transition-all duration-300"
                style={{ height: `${height * 0.7}%` }}
              />
            </div>
            {/* Tooltip */}
            <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10">
              {height * 10} actions
            </div>
          </div>
        ))}
        {/* Grid lines */}
        <div className="absolute inset-0 border-b border-admin-border pointer-events-none" />
        <div className="absolute inset-0 border-b border-admin-border pointer-events-none" style={{ top: '50%' }} />
      </div>

      <div className="flex justify-between mt-4 text-xs font-semibold text-admin-muted-foreground uppercase tracking-wider">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
          <div key={day} className="w-full text-center">{day}</div>
        ))}
      </div>
    </div>
  );
}
