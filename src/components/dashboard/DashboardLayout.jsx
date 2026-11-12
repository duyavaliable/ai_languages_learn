import React from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ExercisePanel from './ExercisePanel';
import VocabularyPanel from './VocabularyPanel';

/**
 * Khung trang của người học.
 *
 * KHÁC BẢN MẪU: BỎ HẲN "chế độ tổng quan".
 *
 * Bản mẫu có hai chế độ — chưa chọn kỹ năng thì hiện HeroBanner / StatsCards /
 * QuickAccess / WeeklyProgress / OverallProgress, chọn rồi mới hiện danh sách
 * bài. Bỏ chế độ đó vì toàn bộ nó dựng trên các chỉ số đồ án KHÔNG đo:
 * streak, XP, tiến độ tuần, phần trăm hoàn thành. Hiện số 0 cố định là hứa
 * hẹn một thứ không có.
 *
 * Nên trang luôn ở "chế độ bài tập": vào là thấy ngay danh sách bài của kỹ
 * năng đang chọn. Người học đăng nhập xong rơi thẳng vào Từ vựng.
 */
const VOCAB_SKILLS = ['vocabulary', 'flashcards'];

export default function DashboardLayout({
  children,
  // State
  filteredExercises,
  loading,
  error,
  searchQuery,
  selectedSkill,
  selectedLanguage,
  user,

  // Handlers
  onSelectSkill,
  onLanguageChange,
  onSearchChange,
  onOpenExercise,
  onLogout
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex">
      <Sidebar
        selectedSkill={selectedSkill}
        onSelectSkill={onSelectSkill}
        language={selectedLanguage}
      />

      <main className="ml-64 flex-1 flex flex-col min-w-0">
        <Topbar
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          selectedLanguage={selectedLanguage}
          onLanguageChange={onLanguageChange}
          user={user}
          onLogout={onLogout}
        />

        <div className="p-8 max-w-7xl w-full mx-auto space-y-8 flex-1">
          {children || (
            // Tu vung va Flashcards doc bang `vocabulary`, KHONG phai
            // `exercises` -- di qua ExercisePanel thi danh sach luon rong.
            VOCAB_SKILLS.includes(selectedSkill) ? (
              <VocabularyPanel
                mode={selectedSkill}
                language={selectedLanguage}
                searchQuery={searchQuery}
              />
            ) : (
            <ExercisePanel
              selectedSkill={selectedSkill}
              filteredExercises={filteredExercises}
              loading={loading}
              error={error}
              searchQuery={searchQuery}
              onSearchChange={onSearchChange}
              onOpenExercise={onOpenExercise}
            />
            )
          )}
        </div>
      </main>
    </div>
  );
}
