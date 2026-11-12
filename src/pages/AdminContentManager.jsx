import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LibraryBig, Languages, Trash2, Eye, Search, Clock, RotateCcw, Pencil, Plus, X } from 'lucide-react';
import api from '../services/api';
import AdminLayout, { AdminNotice, StatTile } from '../components/admin/AdminLayout';
import { skillsForLanguage } from '../components/dashboard/Sidebar';
import TeacherCreateContent from './TeacherCreateContent';

/**
 * Quản lý nội dung (bảng `exercises`).
 *
 * CHIA THEO NGÔN NGỮ TRƯỚC, RỒI MỚI ĐẾN KỸ NĂNG. Hai ngôn ngữ không cùng bộ
 * kỹ năng (Anh: nghe · nói · đọc · viết; Nhật: nghe · nói · ngữ pháp · đọc
 * hiểu), nên danh sách kỹ năng lấy từ `skillsForLanguage` — đúng bộ mà thanh
 * bên của trang học đang dùng. Trước đây gộp chung hai ngôn ngữ và lọc theo
 * 4 kỹ năng cố định của tiếng Anh, nên bài Ngữ pháp / Từ vựng không lọc được.
 *
 * TẢI HẾT MỘT LẦN khi mở trang rồi lọc tại chỗ. Trước đây danh sách chỉ tải
 * khi bấm lại vào tab "Exercise" -> mở trang ra thấy rỗng.
 *
 * TỪ VỰNG nằm ở HAI bảng: bộ từ (`vocabulary` — trang Từ vựng / Flashcards
 * của người học đọc bảng này) và đề luyện tập trắc nghiệm (`exercises`,
 * skill 'vocabulary' — Flashcards > Luyện tập). Tab Từ vựng hiện cả hai; số
 * trên nút là số TỪ, vì đó là thứ người học thấy ở trang Từ vựng.
 *
 * TẠO BÀI MỚI nằm ngay trong trang này (nút "Tạo bài mới", `?create=1`),
 * không còn trang riêng. SỬA một bài: nút "Sửa" -> /admin/exercises/:id/edit.
 */
const LANGS = [
  { code: 'en', label: 'Tiếng Anh', id: 1 },
  { code: 'ja', label: 'Tiếng Nhật', id: 2 }
];

// Flashcards không phải loại bài trong `exercises` (đọc bảng `vocabulary`).
const skillTabs = (lang) => skillsForLanguage(lang).filter((s) => s.key !== 'flashcards');

const questionCount = (e) => {
  try {
    const q = JSON.parse(e.questions_json || '[]');
    return Array.isArray(q) ? q.length : 0;
  } catch { return 0; }
};

const btnSoft = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors';

function AdminContentManager() {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const [searchParams, setSearchParams] = useSearchParams();

  const lang = LANGS.some((l) => l.code === searchParams.get('lang')) ? searchParams.get('lang') : 'en';
  const skill = skillTabs(lang).some((s) => s.key === searchParams.get('skill')) ? searchParams.get('skill') : '';
  const creating = searchParams.get('create') === '1';

  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [search, setSearch] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);

  // `replace`: đổi tab không chồng thêm bước lịch sử.
  const setView = (next) => setSearchParams(
    Object.fromEntries(Object.entries({ lang, skill, create: creating ? '1' : '', ...next }).filter(([, v]) => v)),
    { replace: true }
  );

  const fetchExercises = () => {
    setLoading(true);
    api.get('/exercises?includeDeleted=true')
      .then((r) => { setExercises(r.data || []); setLoading(false); })
      .catch((err) => {
        setMsg({ type: 'error', text: err.response?.data?.message || 'Không tải được danh sách bài tập' });
        setLoading(false);
      });
  };

  const [words, setWords] = useState([]);
  const [wordsLoading, setWordsLoading] = useState(true);

  const fetchWords = () => {
    setWordsLoading(true);
    Promise.all([api.get('/vocabulary'), api.get('/vocabulary/deleted')])
      .then(([live, dead]) => {
        setWords([...(live.data || []), ...(dead.data || [])]);
        setWordsLoading(false);
      })
      .catch((err) => {
        setMsg({ type: 'error', text: err.response?.data?.message || 'Không tải được bộ từ vựng' });
        setWordsLoading(false);
      });
  };

  useEffect(() => {
    if (currentUser.role !== 'admin') {
      navigate('/');
      return;
    }
    fetchExercises();
    fetchWords();
  }, []);

  const langId = LANGS.find((l) => l.code === lang)?.id;
  const wordsOfLang = useMemo(() => {
    const q = search.trim().toLowerCase();
    return words
      .filter((w) => Number(w.language_id) === langId && (showDeleted || !w.is_deleted))
      .filter((w) => !q || [w.word, w.meaning, w.pronunciation].some((v) => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => a.id - b.id);
  }, [words, langId, showDeleted, search]);
  const wordCount = (code) => words.filter((w) => Number(w.language_id) === LANGS.find((l) => l.code === code)?.id && !w.is_deleted).length;

  // Xoá mềm -> (đã xoá) khôi phục hoặc xoá hẳn. Cùng quy ước với bài tập.
  const handleWordAction = async (w, action) => {
    const ask = {
      delete: `Xoá mềm từ "${w.word}"? Người học sẽ không thấy từ này nữa.`,
      purge: `Xoá hẳn từ "${w.word}"? Không khôi phục được.`
    }[action];
    if (ask && !window.confirm(ask)) return;
    setMsg(null);
    try {
      if (action === 'delete') await api.delete(`/vocabulary/${w.id}`);
      if (action === 'restore') await api.patch(`/vocabulary/${w.id}/restore`);
      if (action === 'purge') await api.delete(`/vocabulary/${w.id}/permanent`);
      const done = { delete: 'xoá mềm', restore: 'khôi phục', purge: 'xoá hẳn' }[action];
      setMsg({ type: 'success', text: `Đã ${done} từ "${w.word}"` });
      fetchWords();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Thao tác thất bại' });
    }
  };

  const visible = useMemo(
    () => exercises.filter((e) => showDeleted || !e.is_deleted),
    [exercises, showDeleted]
  );
  const ofLang = useMemo(() => visible.filter((e) => e.language === lang), [visible, lang]);

  const countBy = (list, key, value) => list.filter((e) => e[key] === value).length;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ofLang
      .filter((e) => !skill || e.skill_type === skill)
      .filter((e) => !q || String(e.title || '').toLowerCase().includes(q))
      .sort((a, b) => a.id - b.id);
  }, [ofLang, skill, search]);

  const skillLabel = (key) => skillTabs(lang).find((s) => s.key === key)?.label || key;

  const handleDeleteExercise = async (e) => {
    const confirmText = e.is_deleted
      ? `Bài "${e.title}" đã xoá mềm. Xoá cứng (vĩnh viễn, không khôi phục được)?`
      : `Xoá mềm bài "${e.title}"? Người học sẽ không thấy bài này nữa. Bấm xoá lần nữa để xoá cứng.`;
    if (!window.confirm(confirmText)) return;

    setMsg(null);
    try {
      const res = await api.delete(`/exercises/${e.id}`);
      const hard = String(res?.data?.mode || '').toLowerCase() === 'hard';
      setMsg({ type: 'success', text: `Đã ${hard ? 'xoá cứng' : 'xoá mềm'} bài "${e.title}"` });
      fetchExercises();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Xoá bài thất bại' });
    }
  };

  const handleRestoreExercise = async (e) => {
    setMsg(null);
    try {
      await api.patch(`/exercises/${e.id}/restore`);
      setMsg({ type: 'success', text: `Đã khôi phục bài "${e.title}"` });
      fetchExercises();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Khôi phục thất bại' });
    }
  };

  const activeTotal = exercises.filter((e) => !e.is_deleted).length;
  const deletedTotal = exercises.length - activeTotal;

  return (
    <AdminLayout
      title="Quản lý nội dung"
      subtitle="Bài tập theo ngôn ngữ và kỹ năng"
      actions={(
        <button
          onClick={() => {
            // Đóng form thì tải lại để thấy bài / từ vừa thêm.
            if (creating) { fetchExercises(); fetchWords(); }
            setView({ create: creating ? '' : '1' });
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-[#ffffff] bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-colors"
        >
          {creating ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {creating ? 'Đóng form tạo bài' : 'Tạo bài mới'}
        </button>
      )}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={LibraryBig} label="Đang hiện" value={activeTotal} />
        <StatTile icon={Languages} label="Tiếng Anh" value={exercises.filter((e) => !e.is_deleted && e.language === 'en').length} color="text-indigo-600 bg-indigo-50" />
        <StatTile icon={Languages} label="Tiếng Nhật" value={exercises.filter((e) => !e.is_deleted && e.language === 'ja').length} color="text-pink-600 bg-pink-50" />
        <StatTile icon={Trash2} label="Đã xoá mềm" value={deletedTotal} color="text-amber-600 bg-amber-50" />
      </div>

      <AdminNotice data={msg} />

      {creating && (
        <TeacherCreateContent embedded onCreated={() => { fetchExercises(); fetchWords(); }} />
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Bậc 1: ngôn ngữ */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-full" role="group" aria-label="Chọn ngôn ngữ">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  // Kỹ năng không có ở ngôn ngữ mới thì về "Tất cả".
                  const keep = skillTabs(l.code).some((s) => s.key === skill);
                  setView({ lang: l.code, skill: keep ? skill : '' });
                }}
                aria-pressed={lang === l.code}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                  lang === l.code ? 'bg-white text-blue-600 shadow-sm ring-1 ring-blue-200' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {l.label}
                <span className="ml-1.5 text-xs text-slate-400 tabular-nums">{countBy(visible, 'language', l.code)}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tiêu đề..."
                className="w-56 pl-9 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-full text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-slate-100 text-xs font-semibold text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} className="accent-blue-600" />
              Hiện bài đã xoá mềm
            </label>
          </div>
        </div>

        {/* Bậc 2: kỹ năng của ngôn ngữ đang chọn */}
        <div className="flex flex-wrap gap-2 px-5 py-4 border-b border-slate-100">
          {[{ key: '', label: 'Tất cả' }, ...skillTabs(lang)].map((s) => {
            const Icon = s.icon;
            const active = skill === s.key;
            // Từ vựng: đếm số TỪ (bảng `vocabulary`), không phải số đề.
            const n = s.key === 'vocabulary'
              ? wordCount(lang)
              : s.key ? countBy(ofLang, 'skill_type', s.key) : ofLang.length;
            return (
              <button
                key={s.key || 'all'}
                onClick={() => setView({ skill: s.key })}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all ${
                  active ? 'bg-blue-600 text-[#ffffff] shadow-md shadow-blue-500/25' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {s.label}
                <span className={`text-xs tabular-nums ${active ? 'text-blue-100' : 'text-slate-400'}`}>{n}</span>
              </button>
            );
          })}
        </div>

        {skill === 'vocabulary' && (
          <>
            <div className="px-5 py-3 bg-slate-50/60 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Bộ từ vựng <span className="text-slate-400 font-semibold">({wordsOfLang.length} từ)</span>
              </h3>
              <p className="text-xs text-slate-400">Hiện ở trang Từ vựng và Flashcards của người học.</p>
            </div>
            {wordsLoading && <p className="py-10 text-center text-sm text-slate-400">Đang tải...</p>}
            {!wordsLoading && (
              <div className="overflow-x-auto border-b border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <th className="px-5 py-3 w-14">ID</th>
                      <th className="px-5 py-3">Từ</th>
                      <th className="px-5 py-3">Phát âm</th>
                      <th className="px-5 py-3">Nghĩa</th>
                      <th className="px-5 py-3">Loại từ</th>
                      <th className="px-5 py-3">Trạng thái</th>
                      <th className="px-5 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {wordsOfLang.map((w) => (
                      <tr key={w.id} className={w.is_deleted ? 'bg-amber-50/40' : 'hover:bg-slate-50/60'}>
                        <td className="px-5 py-3 text-slate-400 tabular-nums">{w.id}</td>
                        <td className={`px-5 py-3 font-semibold ${w.is_deleted ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{w.word}</td>
                        <td className="px-5 py-3 text-slate-500">{w.pronunciation || '—'}</td>
                        <td className="px-5 py-3 text-slate-700">{w.meaning}</td>
                        <td className="px-5 py-3 text-slate-500">{w.part_of_speech || '—'}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${w.is_deleted ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${w.is_deleted ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                            {w.is_deleted ? 'Đã xoá mềm' : 'Đang hiện'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-2">
                            {w.is_deleted ? (
                              <>
                                <button onClick={() => handleWordAction(w, 'restore')} className={`${btnSoft} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  Khôi phục
                                </button>
                                <button onClick={() => handleWordAction(w, 'purge')} className={`${btnSoft} bg-red-50 text-red-600 hover:bg-red-100`}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Xoá hẳn
                                </button>
                              </>
                            ) : (
                              <button onClick={() => handleWordAction(w, 'delete')} className={`${btnSoft} bg-red-50 text-red-600 hover:bg-red-100`}>
                                <Trash2 className="w-3.5 h-3.5" />
                                Xoá mềm
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {wordsOfLang.length === 0 && (
                      <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">Chưa có từ vựng.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-5 py-3 bg-slate-50/60 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Đề luyện tập từ vựng <span className="text-slate-400 font-semibold">({rows.length} đề)</span>
              </h3>
              <p className="text-xs text-slate-400">Hiện ở Flashcards → Luyện tập.</p>
            </div>
          </>
        )}

        {loading && <p className="py-12 text-center text-sm text-slate-400">Đang tải...</p>}

        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 w-14">ID</th>
                  <th className="px-5 py-3">Tiêu đề</th>
                  <th className="px-5 py-3">Kỹ năng</th>
                  <th className="px-5 py-3">Số câu</th>
                  <th className="px-5 py-3">Thời gian</th>
                  <th className="px-5 py-3">Trạng thái</th>
                  <th className="px-5 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((e) => {
                  const n = questionCount(e);
                  return (
                    <tr key={e.id} className={e.is_deleted ? 'bg-amber-50/40' : 'hover:bg-slate-50/60'}>
                      <td className="px-5 py-3 text-slate-400 tabular-nums">{e.id}</td>
                      <td className={`px-5 py-3 font-semibold ${e.is_deleted ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{e.title}</td>
                      <td className="px-5 py-3">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600">{skillLabel(e.skill_type)}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-600 tabular-nums">{n || '—'}</td>
                      <td className="px-5 py-3 text-slate-500">
                        <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{Math.max(1, Math.round((e.time_limit_sec || 0) / 60))} phút</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${e.is_deleted ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${e.is_deleted ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                          {e.is_deleted ? 'Đã xoá mềm' : 'Đang hiện'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          {!e.is_deleted && (
                            <>
                              <button
                                onClick={() => navigate(`/admin/exercises/${e.id}/edit`)}
                                className={`${btnSoft} bg-indigo-50 text-indigo-600 hover:bg-indigo-100`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                Sửa
                              </button>
                              <button
                                onClick={() => navigate(e.speaking_mode === 'read_aloud' ? `/speaking/${e.id}` : `/exercises/${e.id}`)}
                                className={`${btnSoft} bg-blue-50 text-blue-600 hover:bg-blue-100`}
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Xem
                              </button>
                            </>
                          )}
                          {e.is_deleted && (
                            <button onClick={() => handleRestoreExercise(e)} className={`${btnSoft} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
                              <RotateCcw className="w-3.5 h-3.5" />
                              Khôi phục
                            </button>
                          )}
                          <button onClick={() => handleDeleteExercise(e)} className={`${btnSoft} bg-red-50 text-red-600 hover:bg-red-100`}>
                            <Trash2 className="w-3.5 h-3.5" />
                            {e.is_deleted ? 'Xoá cứng' : 'Xoá mềm'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400">Không có bài tập nào.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default AdminContentManager;
