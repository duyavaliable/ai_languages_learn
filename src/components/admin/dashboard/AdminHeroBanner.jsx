import React from 'react';
import { ShieldCheck, Users, LibraryBig } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AdminHeroBanner() {
  const navigate = useNavigate();
  return (
    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-8 lg:p-10 text-white relative overflow-hidden shadow-lg shadow-blue-500/20">
      <div className="relative z-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 backdrop-blur-md rounded-full text-xs font-semibold mb-4">
          <ShieldCheck className="w-4 h-4 text-emerald-300" />
          <span className="text-white">Administrator Access</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">
          Administration Dashboard
        </h1>
        <p className="text-blue-100 max-w-xl text-sm md:text-base mb-8 opacity-90 leading-relaxed">
          Manage learning resources, user accounts, and monitor platform activities in real-time. Keep the system secure and content up to date.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={() => navigate('/admin/users')}
            className="flex items-center gap-2 px-6 py-3 bg-white text-blue-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Users className="w-5 h-5" />
            Manage Users
          </button>
          <button
            onClick={() => navigate('/admin/content')}
            className="flex items-center gap-2 px-6 py-3 bg-blue-700/50 hover:bg-blue-700/70 text-white font-semibold rounded-xl transition-colors backdrop-blur-sm border border-blue-500/30"
          >
            <LibraryBig className="w-5 h-5" />
            Manage Content
          </button>
        </div>
      </div>
      
      {/* Decorative background elements */}
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-3xl opacity-50 pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-500/40 rounded-full blur-3xl opacity-50 pointer-events-none" />
    </div>
  );
}
