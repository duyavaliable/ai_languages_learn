import React from 'react';
import { Flame, Play } from 'lucide-react';
import { assetUrl } from '../../lib/asset';

export default function HeroBanner({ onContinueLearning }) {
  return (
    <section className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-[2rem] p-8 sm:p-10 text-white flex items-center justify-between relative overflow-hidden shadow-xl shadow-blue-600/10">
      <div className="max-w-2xl z-10">
        <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-bold mb-6 border border-white/10">
          <Flame className="w-4 h-4 fill-orange-400 text-orange-400" />
          <span>0-day streak</span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 tracking-tight leading-tight">
          Learn English & Japanese Smarter
        </h1>
        <p className="text-blue-100 text-sm sm:text-base mb-8 max-w-lg font-normal leading-relaxed">
          Master vocabulary, listening, speaking, reading, and writing with interactive practice tests tailored to your level.
        </p>
        <div className="flex flex-wrap gap-4">
          <button
            onClick={onContinueLearning}
            className="bg-white text-blue-600 px-7 py-3.5 rounded-xl font-bold flex items-center gap-2.5 shadow-lg shadow-blue-950/20 hover:bg-slate-50 hover:scale-105 transition-all duration-200"
          >
            <Play className="w-5 h-5 fill-blue-600 text-blue-600" />
            <span>Continue Learning</span>
          </button>
        </div>
      </div>

      <div className="hidden lg:block z-10">
        <img
          src={assetUrl('images/hero-learning.png')}
          alt="Learning Illustration"
          className="max-h-56 w-auto object-contain drop-shadow-2xl hover:scale-105 transition-transform duration-300"
        />
      </div>

      {/* Decorative Background Accents */}
      <div className="absolute -right-16 -bottom-16 w-80 h-80 bg-white/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute right-1/3 -top-16 w-64 h-64 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
    </section>
  );
}
