import React from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import HeroBanner from './HeroBanner';
import StatsCards from './StatsCards';
import QuickAccess from './QuickAccess';
import WeeklyProgress from './WeeklyProgress';
import OverallProgress from './OverallProgress';
import ExercisePanel from './ExercisePanel';

export default function DashboardLayout({
  // State
  exercises,
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
  onLogout,
  onResetOverview
}) {
  const isExerciseMode = Boolean(selectedSkill);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex">
      {/* Sidebar */}
      <Sidebar
        selectedSkill={selectedSkill}
        onSelectSkill={onSelectSkill}
        onResetOverview={onResetOverview}
      />

      {/* Main Content Area */}
      <main className="ml-64 flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <Topbar
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          selectedLanguage={selectedLanguage}
          onLanguageChange={onLanguageChange}
          user={user}
          onLogout={onLogout}
        />

        {/* Dashboard Content Container */}
        <div className="p-8 max-w-7xl w-full mx-auto space-y-8 flex-1">
          {!isExerciseMode ? (
            /* OVERVIEW MODE */
            <>
              {/* Hero Section Banner */}
              <HeroBanner
                onContinueLearning={() => {
                  onSelectSkill('reading');
                }}
              />

              {/* Statistics Grid */}
              <StatsCards />

              {/* Quick Access & Weekly Progress / Overall Progress split */}
              <div className="grid grid-cols-12 gap-8">
                {/* Left Column: Quick Access & Weekly Progress */}
                <div className="col-span-12 lg:col-span-8 space-y-8">
                  <QuickAccess onSelectSkill={onSelectSkill} />
                  <WeeklyProgress />
                </div>

                {/* Right Column: Overall Progress */}
                <div className="col-span-12 lg:col-span-4 space-y-8">
                  <OverallProgress />
                </div>
              </div>
            </>
          ) : (
            /* EXERCISE MODE */
            <ExercisePanel
              selectedSkill={selectedSkill}
              filteredExercises={filteredExercises}
              loading={loading}
              error={error}
              searchQuery={searchQuery}
              onSearchChange={onSearchChange}
              onOpenExercise={onOpenExercise}
              onBackToOverview={onResetOverview}
            />
          )}
        </div>
      </main>
    </div>
  );
}
