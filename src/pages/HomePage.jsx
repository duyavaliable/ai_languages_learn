import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import DashboardLayout from '../components/dashboard/DashboardLayout';

/**
 * Trang của người học.
 *
 * BA KHÁC BIỆT SO VỚI BẢN MẪU, đều do yêu cầu bỏ Dashboard / Course:
 *
 * 1. KHÔNG có trạng thái "chưa chọn kỹ năng". Bản mẫu để `selectedSkill = ''`
 *    nghĩa là đang ở trang tổng quan. Ở đây đăng nhập xong vào thẳng Từ vựng,
 *    và bấm lại một kỹ năng đang chọn thì KHÔNG bỏ chọn (nếu bỏ thì màn hình
 *    trống, vì không còn trang tổng quan để rơi về).
 *
 * 2. Ngôn ngữ dùng mã 'en'/'ja' — khớp cột `code` của bảng `languages` và
 *    khớp trường `language` mà API bài tập trả về. Bản mẫu dùng 'english' rồi
 *    so khớp bằng chữ cái đầu, dễ sai khi thêm ngôn ngữ mới.
 *
 * 3. Đổi ngôn ngữ thì GIỮ kỹ năng đang xem nếu ngôn ngữ mới cũng có kỹ năng
 *    đó, ngược lại rơi về Từ vựng. Lý do: tiếng Anh có `writing`, tiếng Nhật
 *    có `grammar` — chuyển qua lại mà giữ cứng sẽ ra danh sách rỗng khó hiểu.
 */
const DEFAULT_SKILL = 'vocabulary';

// Phải khớp Sidebar. Để ở đây để HomePage tự kiểm được kỹ năng có hợp lệ với
// ngôn ngữ đang chọn hay không, không phải đoán.
const SKILLS_BY_LANG = {
  en: ['vocabulary', 'flashcards', 'listening', 'speaking', 'reading', 'writing'],
  ja: ['vocabulary', 'flashcards', 'listening', 'speaking', 'grammar', 'reading']
};

/**
 * NGÔN NGỮ + KỸ NĂNG ĐANG XEM phải sống sót khi rời trang chủ rồi quay lại.
 * Trước đây chúng chỉ là state của React nên mở một bài rồi bấm "Quay lại"
 * luôn rơi về Tiếng Anh / Từ vựng. Giờ lưu ở hai chỗ:
 *   - URL (`/?lang=ja&skill=reading`) — nút Quay lại (`navigate(-1)`) và nút
 *     Back của trình duyệt trả về đúng mục cũ;
 *   - sessionStorage — các trang đi về bằng `navigate('/')` (trang luyện nói,
 *     trang quản trị) cũng về đúng mục cũ.
 */
const VIEW_KEY = 'home:view';

function readSavedView() {
  try { return JSON.parse(sessionStorage.getItem(VIEW_KEY) || '{}'); } catch { return {}; }
}

function resolveInitialView(searchParams) {
  const saved = readSavedView();
  const lang = [searchParams.get('lang'), saved.lang].find((l) => SKILLS_BY_LANG[l]) || 'en';
  const allowed = SKILLS_BY_LANG[lang];
  const skill = [searchParams.get('skill'), saved.skill].find((s) => allowed.includes(s)) || DEFAULT_SKILL;
  return { lang, skill };
}

function HomePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialView] = useState(() => resolveInitialView(searchParams));
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState(initialView.skill);
  const [selectedLanguage, setSelectedLanguage] = useState(initialView.lang);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // `replace` để đổi mục không tạo thêm bước lịch sử — bấm Back của trình
  // duyệt vẫn ra khỏi trang chủ chứ không lùi qua từng kỹ năng đã bấm.
  useEffect(() => {
    sessionStorage.setItem(VIEW_KEY, JSON.stringify({ lang: selectedLanguage, skill: selectedSkill }));
    setSearchParams({ lang: selectedLanguage, skill: selectedSkill }, { replace: true });
  }, [selectedLanguage, selectedSkill, setSearchParams]);

  useEffect(() => {
    api.get('/exercises')
      .then((res) => {
        setExercises(res.data || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Không thể tải danh sách bài tập');
        setLoading(false);
      });
  }, []);

  const filteredExercises = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let items = exercises.slice();

    const want = String(selectedLanguage || '').toLowerCase();
    items = items.filter((ex) => {
      const lang = String(ex.language || ex.lang || ex.language_code || '').toLowerCase();
      return lang === want;
    });

    if (selectedSkill) {
      items = items.filter((ex) => ex.skill_type === selectedSkill);
    }
    if (!query) return items;

    return items.filter((ex) => [ex.title, ex.skill_type]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(query)));
  }, [exercises, searchQuery, selectedSkill, selectedLanguage]);

  // Bấm lại kỹ năng đang chọn thì giữ nguyên — không có trang tổng quan để về.
  const handleSelectSkill = (skill) => setSelectedSkill(skill || DEFAULT_SKILL);

  const handleLanguageChange = (lang) => {
    setSelectedLanguage(lang);
    const allowed = SKILLS_BY_LANG[lang] || SKILLS_BY_LANG.en;
    if (!allowed.includes(selectedSkill)) setSelectedSkill(DEFAULT_SKILL);
  };

  const handleOpenExercise = (exercise) => {
    if (!exercise?.skill_type) return;
    // Đọc to theo văn bản cho sẵn đi sang trang chấm phát âm riêng.
    if (exercise.speaking_mode === 'read_aloud') {
      navigate(`/speaking/${exercise.id}`);
      return;
    }
    navigate(`/exercises/${exercise.id}`);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem(VIEW_KEY);
    sessionStorage.removeItem('flashcards:view');
    navigate('/login');
  };

  return (
    <DashboardLayout
      filteredExercises={filteredExercises}
      loading={loading}
      error={error}
      searchQuery={searchQuery}
      selectedSkill={selectedSkill}
      selectedLanguage={selectedLanguage}
      user={user}
      onSelectSkill={handleSelectSkill}
      onLanguageChange={handleLanguageChange}
      onSearchChange={setSearchQuery}
      onOpenExercise={handleOpenExercise}
      onLogout={handleLogout}
    />
  );
}

export default HomePage;
