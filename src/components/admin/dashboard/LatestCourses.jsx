import React from 'react';
import { Eye, Edit, Trash2, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function LatestCourses({ courses = [] }) {
  const navigate = useNavigate();
  // Display only the latest 3 courses for the dashboard
  const latestCourses = courses.slice(0, 3);

  if (latestCourses.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-admin-card-foreground">Latest Courses</h2>
        <button 
          onClick={() => navigate('/admin/content')}
          className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          View all
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {latestCourses.map(course => (
          <div key={course.id} className="bg-admin-card border border-admin-border rounded-2xl p-5 hover:shadow-md transition-shadow group flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                course.level === 'C1' ? 'bg-admin-danger-soft text-admin-danger' :
                course.level === 'B2' ? 'bg-admin-warning-soft text-admin-warning' :
                course.level === 'B1' ? 'bg-admin-primary-soft text-admin-primary' :
                'bg-admin-success-soft text-admin-success'
              }`}>
                {course.level || 'A2'}
              </span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button title="View" className="p-1.5 text-admin-muted-foreground hover:text-admin-card-foreground hover:bg-admin-muted rounded-md transition-colors"><Eye className="w-4 h-4" /></button>
                <button title="Edit" onClick={() => navigate('/admin/content')} className="p-1.5 text-admin-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"><Edit className="w-4 h-4" /></button>
              </div>
            </div>
            <h3 className="font-bold text-admin-card-foreground text-lg mb-2 line-clamp-1">{course.name}</h3>
            <p className="text-sm text-admin-muted-foreground line-clamp-2 mb-4 flex-1">
              {course.description || 'No description available for this course.'}
            </p>
            <div className="pt-4 border-t border-admin-border flex justify-between items-center">
              <span className="text-xs font-semibold text-admin-muted-foreground">
                {course.lessons?.length || 0} Lessons
              </span>
              <div className="flex gap-2">
                <button title="Publish" className="text-xs font-semibold flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-lg transition-colors">
                  <Send className="w-3.5 h-3.5" /> Publish
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
