import React from 'react';
import {
  BookOpen,
  Headphones,
  PenTool,
  Mic2,
  Library,
  Layers,
  Clock,
  ChevronRight,
  Search
} from 'lucide-react';
import { assetUrl } from '../../lib/asset';

const skillMeta = {
  reading: { label: 'Đọc', icon: Library, image: assetUrl('images/reading-illustration.png'), color: 'text-pink-600 bg-pink-50' },
  listening: { label: 'Nghe', icon: Headphones, image: assetUrl('images/listening-illustration.png'), color: 'text-orange-600 bg-orange-50' },
  writing: { label: 'Viết', icon: PenTool, image: assetUrl('images/writing-illustration.png'), color: 'text-slate-700 bg-slate-100' },
  speaking: { label: 'Nói', icon: Mic2, image: assetUrl('images/speaking-illustration.png'), color: 'text-blue-600 bg-blue-50' },
  vocabulary: { label: 'Từ vựng', icon: BookOpen, image: assetUrl('images/reading-illustration.png'), color: 'text-emerald-600 bg-emerald-50' },
  flashcards: { label: 'Flashcards', icon: Layers, image: assetUrl('images/reading-illustration.png'), color: 'text-indigo-600 bg-indigo-50' },
  grammar: { label: 'Ngữ pháp', icon: BookOpen, image: assetUrl('images/reading-illustration.png'), color: 'text-blue-600 bg-blue-50' }
};

export default function ExercisePanel({
  selectedSkill,
  filteredExercises,
  loading,
  error,
  searchQuery,
  onSearchChange,
  onOpenExercise
}) {
  const currentSkillMeta = skillMeta[selectedSkill] || skillMeta.reading;
  const SkillIcon = currentSkillMeta.icon;

  return (
    <div className="space-y-6">
      {/* Top Navigation / Breadcrumb for Exercise Mode */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${currentSkillMeta.color}`}>
            <SkillIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 capitalize">
              Luyện {currentSkillMeta.label}
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              Danh sách bài tập và luyện tập kỹ năng
            </p>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-semibold bg-slate-100 px-3.5 py-2 rounded-full">
          {filteredExercises.length} bài tập khả dụng
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex justify-end bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search exercises..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="py-16 text-center text-sm text-slate-400 font-medium">
          Đang tải danh sách bài tập...
        </div>
      )}

      {error && (
        <div className="py-16 text-center text-sm text-red-500 font-medium">
          {error}
        </div>
      )}

      {!loading && !error && filteredExercises.length === 0 && (
        <div className="py-16 text-center bg-white rounded-2xl border border-slate-100 p-8 shadow-sm">
          <p className="text-slate-600 font-semibold text-base mb-1">Không tìm thấy bài tập nào phù hợp</p>
          <p className="text-xs text-slate-400">Vui lòng thử tìm kiếm với từ khóa khác.</p>
        </div>
      )}

      {/* Exercise Cards Grid */}
      {!loading && !error && filteredExercises.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredExercises.map((exercise) => {
            const meta = skillMeta[exercise.skill_type] || currentSkillMeta;
            const Icon = meta.icon;
            const duration = Math.max(1, Math.round((exercise.time_limit_sec || 600) / 60));

            return (
              <div
                key={exercise.id}
                onClick={() => onOpenExercise(exercise)}
                className="group cursor-pointer bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className="relative h-40 overflow-hidden bg-slate-100">
                    <img
                      src={meta.image}
                      alt={exercise.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent" />
                  </div>

                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`p-1.5 rounded-lg ${meta.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {meta.label}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-800 text-sm leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors mb-2">
                      {exercise.title}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      Bài tập luyện kỹ năng.
                    </p>
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-slate-50 flex items-center justify-between text-xs text-slate-400 font-medium">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {duration}m
                  </span>
                  <span className="inline-flex items-center gap-1 font-bold text-blue-600 group-hover:translate-x-0.5 transition-transform">
                    Start <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
