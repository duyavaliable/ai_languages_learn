import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Layers, Volume2, RotateCcw, ChevronLeft, ChevronRight, ClipboardCheck, Clock } from 'lucide-react';
import api from '../../services/api';

/**
 * Từ vựng và Flashcards.
 *
 * VÌ SAO LÀ PANEL RIÊNG, KHÔNG DÙNG `ExercisePanel`. Hai kỹ năng này KHÔNG
 * nằm trong bảng `exercises` — chúng đọc bảng `vocabulary` (30 từ tiếng Anh,
 * 30 từ tiếng Nhật). Nếu để chúng đi qua đường `/exercises` như các kỹ năng
 * khác thì danh sách luôn rỗng, vì `exercises` không có dòng nào mang
 * `skill_type = 'vocabulary'`.
 *
 * Cùng một dữ liệu, hai cách hiển thị:
 *   mode='vocabulary' -> bảng tra cứu, thấy hết nghĩa
 *   mode='flashcards' -> lật từng thẻ, nghĩa giấu đi cho tới khi bấm
 *
 * Flashcards có thêm nút "Luyện tập": liệt kê các ĐỀ trắc nghiệm chữ & từ
 * vựng (bảng `exercises`, `skill_type = 'vocabulary'`, ví dụ phần 文字・語彙
 * của đề JLPT). Bấm một đề thì mở trang làm bài như các kỹ năng khác.
 */
const LANG_ID = { en: 1, ja: 2 };

export default function VocabularyPanel({ mode = 'vocabulary', language = 'en', searchQuery = '' }) {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // chỉ dùng cho flashcards
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // chỉ dùng cho flashcards: 'cards' = lật thẻ, 'practice' = danh sách đề
  const navigate = useNavigate();
  // Nhớ tab đang mở để làm xong một đề bấm "Quay lại" vẫn ở Luyện tập.
  const [view, setView] = useState(() => (
    sessionStorage.getItem('flashcards:view') === 'practice' ? 'practice' : 'cards'
  ));
  const [practice, setPractice] = useState([]);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceError, setPracticeError] = useState('');

  useEffect(() => { sessionStorage.setItem('flashcards:view', view); }, [view]);

  useEffect(() => {
    if (mode !== 'flashcards' || view !== 'practice') return undefined;
    let alive = true;
    setPracticeLoading(true);
    setPracticeError('');
    api.get(`/exercises?skill=vocabulary&lang=${language}`)
      .then((res) => {
        if (!alive) return;
        // API trả mới nhất trước; đề luyện tập thì xếp theo thứ tự nạp.
        setPractice((Array.isArray(res.data) ? res.data : []).slice().sort((a, b) => a.id - b.id));
        setPracticeLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setPracticeError('Không tải được bài luyện tập');
        setPracticeLoading(false);
      });
    return () => { alive = false; };
  }, [mode, view, language]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api.get(`/vocabulary?languageId=${LANG_ID[language] || 1}`)
      .then((res) => {
        if (!alive) return;
        const d = res.data;
        setWords(Array.isArray(d) ? d : (d?.items || d?.data || []));
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError('Không tải được danh sách từ vựng');
        setLoading(false);
      });
    return () => { alive = false; };
  }, [language]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return words;
    return words.filter((w) => [w.word, w.meaning, w.pronunciation]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)));
  }, [words, searchQuery]);

  // Danh sách đổi (lọc, đổi ngôn ngữ) thì con trỏ thẻ phải về đầu, nếu không
  // `index` có thể trỏ ra ngoài mảng và thẻ trắng.
  useEffect(() => { setIndex(0); setFlipped(false); }, [filtered.length, language, mode]);

  const Icon = mode === 'flashcards' ? Layers : BookOpen;
  const title = mode === 'flashcards' ? 'Flashcards' : 'Từ vựng';

  const speak = (w) => {
    try {
      const u = new SpeechSynthesisUtterance(w.word);
      u.lang = language === 'ja' ? 'ja-JP' : 'en-US';
      window.speechSynthesis.speak(u);
    } catch { /* trình duyệt không hỗ trợ thì bỏ qua */ }
  };

  const card = filtered[index];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl text-emerald-600 bg-emerald-50">
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-400 font-medium">
              {language === 'ja' ? 'Tiếng Nhật' : 'Tiếng Anh'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'flashcards' && (
            <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs font-semibold">
              <button
                onClick={() => setView('cards')}
                className={`px-3.5 py-1.5 rounded-full transition-colors ${view === 'cards' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Thẻ từ
              </button>
              <button
                onClick={() => setView('practice')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-colors ${view === 'practice' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                Luyện tập
              </button>
            </div>
          )}
          {!(mode === 'flashcards' && view === 'practice') && (
            <div className="text-xs text-slate-500 font-semibold bg-slate-100 px-3.5 py-2 rounded-full">
              {filtered.length} từ
            </div>
          )}
        </div>
      </div>

      {/* ---------- LUYỆN TẬP (danh sách đề chữ & từ vựng) ---------- */}
      {mode === 'flashcards' && view === 'practice' && (
        <div className="space-y-3">
          {practiceLoading && <p className="text-sm text-slate-500">Đang tải...</p>}
          {practiceError && <p className="text-sm text-red-600">{practiceError}</p>}
          {!practiceLoading && !practiceError && practice.length === 0 && (
            <p className="text-sm text-slate-500">Chưa có bài luyện tập cho ngôn ngữ này.</p>
          )}
          {!practiceLoading && !practiceError && practice.map((ex) => {
            let count = 0;
            try { count = JSON.parse(ex.questions_json || '[]').length; } catch { /* để 0 */ }
            return (
              <button
                key={ex.id}
                onClick={() => navigate(`/exercises/${ex.id}`)}
                className="w-full flex items-center justify-between gap-4 bg-white rounded-xl border border-slate-100 p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all text-left"
              >
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{ex.title}</p>
                  <p className="text-xs text-slate-500 mt-1">{count} câu trắc nghiệm</p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                  <Clock className="w-3.5 h-3.5" />
                  {Math.max(1, Math.round((ex.time_limit_sec || 600) / 60))} phút
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!(mode === 'flashcards' && view === 'practice') && loading && <p className="text-sm text-slate-500">Đang tải...</p>}
      {!(mode === 'flashcards' && view === 'practice') && error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && !(mode === 'flashcards' && view === 'practice') && filtered.length === 0 && (
        <p className="text-sm text-slate-500">
          {searchQuery ? 'Không có từ nào khớp với tìm kiếm.' : 'Chưa có từ vựng cho ngôn ngữ này.'}
        </p>
      )}

      {/* ---------- FLASHCARDS ---------- */}
      {!loading && !error && mode === 'flashcards' && view === 'cards' && card && (
        <div className="flex flex-col items-center gap-6">
          <button
            onClick={() => setFlipped((f) => !f)}
            className="w-full max-w-xl min-h-56 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all p-8 flex flex-col items-center justify-center gap-3 text-center"
          >
            {!flipped ? (
              <>
                <span className="text-3xl font-bold text-slate-900">{card.word}</span>
                {card.pronunciation && (
                  <span className="text-sm text-slate-400">{card.pronunciation}</span>
                )}
                <span className="text-xs text-slate-400 mt-4">Bấm để xem nghĩa</span>
              </>
            ) : (
              <>
                <span className="text-xl font-semibold text-emerald-700">{card.meaning}</span>
                {card.example_sentence && (
                  <span className="text-sm text-slate-500 italic mt-2">{card.example_sentence}</span>
                )}
                {card.part_of_speech && (
                  <span className="text-xs text-slate-400 mt-1">{card.part_of_speech}</span>
                )}
              </>
            )}
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={() => { setIndex((i) => Math.max(0, i - 1)); setFlipped(false); }}
              disabled={index === 0}
              className="p-2.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-semibold text-slate-500 tabular-nums">
              {index + 1} / {filtered.length}
            </span>
            <button
              onClick={() => { setIndex((i) => Math.min(filtered.length - 1, i + 1)); setFlipped(false); }}
              disabled={index >= filtered.length - 1}
              className="p-2.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => { setIndex(0); setFlipped(false); }}
              className="p-2.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
              title="Về thẻ đầu"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              onClick={() => speak(card)}
              className="p-2.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100"
              title="Đọc từ"
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* ---------- BẢNG TRA CỨU ---------- */}
      {!loading && !error && mode === 'vocabulary' && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((w) => (
            <div key={w.id} className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-lg font-bold text-slate-900 truncate">{w.word}</p>
                  {w.pronunciation && (
                    <p className="text-xs text-slate-400 truncate">{w.pronunciation}</p>
                  )}
                </div>
                <button
                  onClick={() => speak(w)}
                  className="shrink-0 p-2 rounded-full text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                  title="Đọc từ"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-slate-700 mt-3">{w.meaning}</p>
              {w.example_sentence && (
                <p className="text-xs text-slate-500 italic mt-2">{w.example_sentence}</p>
              )}
              {w.part_of_speech && (
                <span className="inline-block mt-3 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {w.part_of_speech}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
