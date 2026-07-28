import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import DashboardLayout from '../components/dashboard/DashboardLayout';

function HomePage() {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('english');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    api.get('/exercises')
      .then((exerciseRes) => {
        setExercises(exerciseRes.data || []);
        setLoading(false);
      })
      .catch((err) => {
        setError('Không thể tải danh sách bài tập');
        setLoading(false);
        console.error(err);
      });
  }, []);

  const filteredExercises = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let items = exercises.slice();

    // Language filtering: 'all' shows both English and Japanese
    if (selectedLanguage && selectedLanguage !== 'all') {
      const want = String(selectedLanguage || '').toLowerCase();
      items = items.filter((exercise) => {
        const lang = String(exercise.language || exercise.lang || exercise.language_code || '').toLowerCase();
        if (!lang) return false;
        return lang.startsWith(want.charAt(0)) || lang.includes(want);
      });
    }

    const hasSkillFilter = Boolean(selectedSkill);

    if (hasSkillFilter) {
      items = items.filter((exercise) => exercise.skill_type === selectedSkill);
    }

    if (!hasSkillFilter && !query) {
      return items;
    }

    if (!query) return items;

    return items.filter((exercise) => [exercise.title, exercise.skill_type]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)));
  }, [exercises, searchQuery, selectedSkill, selectedLanguage]);

  const handleSelectSkill = (skill) => {
    setSelectedSkill((prev) => (prev === skill ? '' : skill));
  };

  const handleExerciseLanguageNav = (language) => {
    setSelectedLanguage(language);
    setSelectedSkill('');
  };

  const handleOpenExercise = (exercise) => {
    if (!exercise?.skill_type) return;
    const courseId = Number(exercise?.course_id) || 1;
    navigate(`/courses/${courseId}/skills/${exercise.skill_type}/exercises/${exercise.id}`);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const resetToOverview = () => {
    setSelectedSkill('');
    setSearchQuery('');
  };

  return (
    <DashboardLayout
      exercises={exercises}
      filteredExercises={filteredExercises}
      loading={loading}
      error={error}
      searchQuery={searchQuery}
      selectedSkill={selectedSkill}
      selectedLanguage={selectedLanguage}
      user={user}
      onSelectSkill={handleSelectSkill}
      onLanguageChange={handleExerciseLanguageNav}
      onSearchChange={setSearchQuery}
      onOpenExercise={handleOpenExercise}
      onLogout={handleLogout}
      onResetOverview={resetToOverview}
    />
  );
}

export default HomePage;
