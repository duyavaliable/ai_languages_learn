import React from 'react';
import { Eye, Edit, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function LatestExercises({ exercises = [] }) {
  const navigate = useNavigate();
  // Display only the latest 4 exercises
  const latestExercises = exercises.slice(0, 4);

  if (latestExercises.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-admin-card-foreground">Latest Exercises</h2>
        <button 
          onClick={() => navigate('/admin/content')}
          className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          View all
        </button>
      </div>
      <div className="bg-admin-card border border-admin-border rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-admin-border bg-admin-muted/20">
              <th className="px-5 py-3 font-semibold text-admin-muted-foreground">Title</th>
              <th className="px-5 py-3 font-semibold text-admin-muted-foreground">Skill</th>
              <th className="px-5 py-3 font-semibold text-admin-muted-foreground">Language</th>
              <th className="px-5 py-3 text-right font-semibold text-admin-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {latestExercises.map((ex, idx) => (
              <tr key={ex.id || idx} className="border-b border-admin-border/60 last:border-0 hover:bg-admin-muted/40 transition-colors group">
                <td className="px-5 py-4 font-medium text-admin-card-foreground">{ex.title}</td>
                <td className="px-5 py-4">
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {ex.skill_type}
                  </span>
                </td>
                <td className="px-5 py-4 text-admin-muted-foreground">
                  {ex.language || ex.language_code || 'English'}
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button title="View" className="p-1.5 text-admin-muted-foreground hover:text-admin-card-foreground hover:bg-admin-muted rounded-md transition-colors"><Eye className="w-4 h-4" /></button>
                    <button title="Edit" onClick={() => navigate('/admin/content')} className="p-1.5 text-admin-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"><Edit className="w-4 h-4" /></button>
                    <button title="Delete" className="p-1.5 text-admin-muted-foreground hover:text-admin-danger hover:bg-admin-danger-soft rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
