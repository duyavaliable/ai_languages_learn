import React from 'react';
import {
  BookOpen,
  Headphones,
  Mic2,
  PenTool,
  Library,
  Sparkles,
  Layers,
  Ruler
} from 'lucide-react';

/**
 * Thanh bên của người học.
 *
 * KHÁC BẢN MẪU Ở HAI CHỖ, CÓ CHỦ Ý:
 *
 * 1. BỎ nhóm "Overview" (Dashboard + Courses). Người học chưa bao giờ CHỌN
 *    khoá học — khoá chỉ là `course_id` của chính bài tập. Còn Dashboard thì
 *    chỉ là trạng thái "chưa chọn kỹ năng", không phải một trang.
 *
 * 2. Danh sách kỹ năng ĐỔI THEO NGÔN NGỮ. Hai ngôn ngữ dạy khác nhau:
 *      tiếng Anh  : nghe · nói · đọc · viết        (bộ VSTEP)
 *      tiếng Nhật : nghe · nói · ngữ pháp · đọc hiểu
 *    Trước đây danh sách gán cứng theo tiếng Anh, nên khoá tiếng Nhật hiện ô
 *    "Viết" không có bài, và thiếu hẳn ô "Ngữ pháp" dù có bài.
 *
 * `vocabulary` và `flashcards` chung cho cả hai nên luôn đứng đầu.
 */
const COMMON = [
  { key: 'vocabulary', label: 'Từ vựng', icon: BookOpen },
  { key: 'flashcards', label: 'Flashcards', icon: Layers }
];

const BY_LANG = {
  en: [
    { key: 'listening', label: 'Nghe', icon: Headphones },
    { key: 'speaking', label: 'Nói', icon: Mic2 },
    { key: 'reading', label: 'Đọc', icon: Library },
    { key: 'writing', label: 'Viết', icon: PenTool }
  ],
  ja: [
    { key: 'listening', label: 'Nghe', icon: Headphones },
    { key: 'speaking', label: 'Nói', icon: Mic2 },
    // "Ngữ pháp" ở đây là BÀI TẬP ngữ pháp (chọn dạng đúng, sắp xếp câu, điền
    // vào đoạn — ba khuôn đề chính thức của JLPT), không phải trang lý thuyết.
    { key: 'grammar', label: 'Ngữ pháp', icon: Ruler },
    { key: 'reading', label: 'Đọc hiểu', icon: Library }
  ]
};

export function skillsForLanguage(lang) {
  return [...COMMON, ...(BY_LANG[lang] || BY_LANG.en)];
}

export default function Sidebar({ selectedSkill, onSelectSkill, language = 'en' }) {
  const items = skillsForLanguage(language);

  return (
    <aside className="w-64 bg-white border-r border-slate-100 flex flex-col fixed left-0 top-0 h-full z-30 shadow-sm">
      {/* Brand / Logo */}
      <div className="p-6 flex items-center gap-3 border-b border-slate-50">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-[#ffffff] shadow-md shadow-blue-500/20">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <span className="text-xl font-bold text-slate-900 tracking-tight block leading-tight">Lingua</span>
          <span className="text-[11px] text-slate-400 font-medium">Learn &amp; Practice</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 overflow-y-auto">
        <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Luyện tập
        </p>
        <div className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = selectedSkill === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onSelectSkill(item.key)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600 text-[#ffffff] font-semibold shadow-md shadow-blue-500/25'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
