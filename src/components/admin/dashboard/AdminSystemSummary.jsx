import React from 'react';

export default function AdminSystemSummary() {
  return (
    <div className="bg-admin-card border border-admin-border rounded-3xl p-6 md:p-8 flex flex-col h-[400px]">
      <h2 className="text-xl font-bold text-admin-card-foreground mb-1">Content Distribution</h2>
      <p className="text-sm text-admin-muted-foreground mb-8">Resource allocation across languages</p>

      <div className="flex-1 flex flex-col items-center justify-center relative">
        {/* Placeholder circular chart */}
        <div className="w-48 h-48 rounded-full border-[16px] border-slate-100 dark:border-slate-800 relative flex items-center justify-center">
          {/* Decorative arcs */}
          <svg className="absolute inset-[-16px] w-[192px] h-[192px] transform -rotate-90">
            <circle 
              cx="96" cy="96" r="80" 
              fill="none" 
              stroke="currentColor" 
              className="text-blue-500" 
              strokeWidth="16" 
              strokeDasharray="502" 
              strokeDashoffset="150" 
            />
            <circle 
              cx="96" cy="96" r="80" 
              fill="none" 
              stroke="currentColor" 
              className="text-emerald-500" 
              strokeWidth="16" 
              strokeDasharray="502" 
              strokeDashoffset="350" 
            />
          </svg>
          <div className="text-center">
            <div className="text-3xl font-black text-admin-card-foreground">2,450</div>
            <div className="text-xs font-bold text-admin-muted-foreground uppercase tracking-widest mt-1">Total Items</div>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-sm font-medium text-admin-card-foreground">English Courses</span>
          </div>
          <span className="text-sm font-bold text-admin-card-foreground">70%</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-admin-card-foreground">Japanese Courses</span>
          </div>
          <span className="text-sm font-bold text-admin-card-foreground">30%</span>
        </div>
      </div>
    </div>
  );
}
