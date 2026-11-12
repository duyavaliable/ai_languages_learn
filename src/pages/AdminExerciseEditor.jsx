import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, Upload, Music, AlertTriangle, CheckCircle2 } from 'lucide-react';
import api from '../services/api';
import { assetUrl } from '../lib/asset';
import AdminLayout, { AdminNotice } from '../components/admin/AdminLayout';

/**
 * Sửa một bài tập (chỉ admin): tiêu đề, thời gian, đề bài, đoạn đọc / transcript,
 * bài mẫu, file nghe và TỪNG CÂU HỎI (nội dung, phương án, đáp án, giải thích).
 *
 * `questions_json` có ba dạng tuỳ loại bài, nên trình sửa câu hỏi cũng ba dạng:
 *   - 'line'   : đọc to (`speaking_mode = read_aloud`) — mỗi phần tử là một câu
 *                thoại { speaker, text, gloss };
 *   - 'prompt' : nói tự do — { subTopicHeading, content };
 *   - 'mcq'    : còn lại (đọc, nghe, ngữ pháp, từ vựng, viết) — câu hỏi trắc
 *                nghiệm { question, options, correctAnswer, explanation, ... }.
 * Mọi trường KHÔNG hiện trên form (provenance, vstep_task, section...) được
 * giữ nguyên khi lưu.
 */
const LETTERS = 'ABCDEFGHIJ';

const inputCls = 'w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors';
const btnSoft = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors';

function parseQuestions(raw) {
  if (Array.isArray(raw)) return raw;
  try { const q = JSON.parse(raw || '[]'); return Array.isArray(q) ? q : []; } catch { return []; }
}

const optionText = (o) => (typeof o === 'string' ? o : String(o?.value ?? o?.text ?? ''));

/** Chỉ số phương án đúng: đáp án lưu dạng chữ cái (A–D) hoặc nguyên văn. */
function correctIndex(q) {
  const opts = (q.options || []).map(optionText);
  const ans = String(q.correctAnswer ?? q.correct_answer ?? '').trim();
  if (/^[A-J]$/i.test(ans) && opts.length > 0) return LETTERS.indexOf(ans.toUpperCase());
  return opts.findIndex((o) => o.trim() === ans);
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

function Card({ title, subtitle, right, children }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <div>
          <h2 className="font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

export default function AdminExerciseEditor() {
  const navigate = useNavigate();
  const { exerciseId } = useParams();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState(15);
  const [taskPrompt, setTaskPrompt] = useState('');
  const [readingPassage, setReadingPassage] = useState('');
  const [sampleAnswer, setSampleAnswer] = useState('');
  const [questions, setQuestions] = useState([]);

  const [audioFile, setAudioFile] = useState(null);
  const [audioUploading, setAudioUploading] = useState(false);
  // Trạng thái hiện NGAY trong khung File nghe — thông báo ở đầu trang nằm
  // ngoài tầm mắt khi đang thao tác ở khung này.
  const [audioStatus, setAudioStatus] = useState(null);
  const [audioBroken, setAudioBroken] = useState(false);
  const [audioVersion, setAudioVersion] = useState(0);

  // Nghe thử file vừa chọn TRƯỚC khi tải lên.
  const previewUrl = useMemo(() => (audioFile ? URL.createObjectURL(audioFile) : ''), [audioFile]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    if (currentUser.role !== 'admin') { navigate('/'); return; }
    api.get(`/exercises/${exerciseId}`)
      .then((res) => {
        const ex = res.data || {};
        setExercise(ex);
        setTitle(ex.title || '');
        setMinutes(Math.max(1, Math.round((ex.time_limit_sec || 900) / 60)));
        setTaskPrompt(ex.task_prompt || '');
        setReadingPassage(ex.reading_passage || '');
        setSampleAnswer(ex.sample_answer || '');
        setQuestions(parseQuestions(ex.questions_json));
        setLoading(false);
      })
      .catch((err) => {
        setMsg({ type: 'error', text: err.response?.data?.message || 'Không tải được bài tập' });
        setLoading(false);
      });
  }, [exerciseId]);

  // Rời trang khi còn thay đổi chưa lưu thì hỏi lại.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const skill = String(exercise?.skill_type || '');
  const kind = exercise?.speaking_mode === 'read_aloud' ? 'line' : skill === 'speaking' ? 'prompt' : 'mcq';
  const isWriting = skill === 'writing';
  const hasAudio = skill === 'listening' || Boolean(exercise?.audio_url);
  const showPassage = !['speaking', 'writing'].includes(skill);
  const showSample = ['writing', 'speaking'].includes(skill) && kind !== 'line';

  const change = (setter) => (value) => { setter(value); setDirty(true); };
  const updateQ = (i, patch) => {
    setQuestions((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
    setDirty(true);
  };
  const removeQ = (i) => {
    if (!window.confirm(`Xoá câu ${i + 1}?`)) return;
    setQuestions((prev) => prev.filter((_, idx) => idx !== i));
    setDirty(true);
  };
  const addQ = () => {
    const last = questions[questions.length - 1] || {};
    const nextId = questions.reduce((m, q) => Math.max(m, Number(q.id) || 0), 0) + 1;
    const blank = kind === 'line'
      ? { speaker: last.speaker || '', text: '', gloss: '' }
      : kind === 'prompt'
        ? { id: nextId, subTopicHeading: last.subTopicHeading || '', content: '', options: [], correct_answer: '' }
        : { id: nextId, question: '', options: isWriting ? [] : ['', '', '', ''], correctAnswer: '', explanation: '', ...(last.section ? { section: last.section } : {}) };
    setQuestions((prev) => [...prev, blank]);
    setDirty(true);
  };

  // ----- phương án trắc nghiệm -----
  const setOption = (qi, oi, value) => {
    const q = questions[qi];
    const opts = (q.options || []).map(optionText);
    const wasCorrect = correctIndex(q) === oi;
    opts[oi] = value;
    // Đáp án lưu nguyên văn thì phải đổi theo khi sửa chữ của phương án đúng.
    const patch = { options: opts };
    if (wasCorrect && !/^[A-J]$/i.test(String(q.correctAnswer || ''))) patch.correctAnswer = value;
    updateQ(qi, patch);
  };
  const addOption = (qi) => updateQ(qi, { options: [...(questions[qi].options || []).map(optionText), ''] });
  const removeOption = (qi, oi) => {
    const q = questions[qi];
    const ci = correctIndex(q);
    const opts = (q.options || []).map(optionText).filter((_, i) => i !== oi);
    let correctAnswer = q.correctAnswer;
    if (ci === oi) correctAnswer = '';
    else if (ci > oi && /^[A-J]$/i.test(String(q.correctAnswer || ''))) correctAnswer = LETTERS[ci - 1];
    updateQ(qi, { options: opts, correctAnswer });
  };
  // Lưu đáp án đúng dạng CHỮ CÁI (A–D) — trang làm bài đổi chữ cái ra phương án
  // theo vị trí. Từ phương án thứ 5 trở đi lưu nguyên văn (trang làm bài chỉ
  // hiểu A–D).
  const chooseCorrect = (qi, oi) => {
    const opts = (questions[qi].options || []).map(optionText);
    updateQ(qi, { correctAnswer: oi < 4 ? LETTERS[oi] : opts[oi], ...(questions[qi].correct_answer !== undefined ? { correct_answer: undefined } : {}) });
  };

  const problems = useMemo(() => {
    const list = [];
    if (!title.trim()) list.push('Tiêu đề đang trống.');
    questions.forEach((q, i) => {
      const n = i + 1;
      if (kind === 'line' && !String(q.text || '').trim()) list.push(`Câu ${n}: chưa có nội dung câu.`);
      if (kind === 'prompt' && !String(q.content || '').trim()) list.push(`Câu ${n}: chưa có câu hỏi.`);
      if (kind === 'mcq') {
        if (!String(q.question || '').trim()) list.push(`Câu ${n}: chưa có nội dung câu hỏi.`);
        if (!isWriting) {
          const opts = (q.options || []).map(optionText);
          if (opts.length < 2) list.push(`Câu ${n}: cần ít nhất 2 phương án.`);
          if (opts.some((o) => !o.trim())) list.push(`Câu ${n}: có phương án để trống.`);
          if (correctIndex(q) < 0) list.push(`Câu ${n}: chưa chọn đáp án đúng.`);
        }
      }
    });
    return list;
  }, [title, questions, kind, isWriting]);

  const handleSave = async () => {
    if (problems.length) {
      setMsg({ type: 'error', text: `Chưa lưu được: ${problems[0]}${problems.length > 1 ? ` (và ${problems.length - 1} lỗi khác)` : ''}` });
      return;
    }
    setSaving(true);
    setMsg(null);
    // Bỏ các khoá đặt undefined (vd. `correct_answer` cũ) trước khi gửi.
    const cleanQuestions = questions.map((q) => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined)));
    try {
      await api.put(`/exercises/${exerciseId}`, {
        title,
        timeLimitSec: Math.max(1, Number(minutes) || 1) * 60,
        taskPrompt,
        readingPassage,
        sampleAnswer,
        questions: cleanQuestions
      });
      setDirty(false);
      setMsg({ type: 'success', text: 'Đã lưu thay đổi.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Lưu thất bại' });
    } finally {
      setSaving(false);
    }
  };

  const handleReplaceAudio = async () => {
    if (!audioFile) return;
    setAudioUploading(true);
    setAudioStatus({ type: 'loading', text: `Đang tải lên "${audioFile.name}"...` });
    try {
      const fd = new FormData();
      fd.append('audioFile', audioFile);
      const res = await api.put(`/exercises/${exerciseId}/audio`, fd, { timeout: 120000 });
      const name = audioFile.name;
      setExercise((ex) => ({ ...ex, audio_url: res.data?.audio_url }));
      setAudioFile(null);
      setAudioBroken(false);
      setAudioVersion((v) => v + 1); // dựng lại trình phát để nạp file mới
      setAudioStatus({ type: 'success', text: `Đã thay thành công bằng "${name}". Bấm Play bên dưới để nghe file mới.` });
    } catch (err) {
      const status = err.response?.status;
      setAudioStatus({
        type: 'error',
        text: status === 404
          ? 'Máy chủ chưa có chức năng thay file nghe — hãy khởi động lại server (npm run dev) rồi thử lại.'
          : err.response?.data?.message || err.message || 'Tải file nghe thất bại'
      });
    } finally {
      setAudioUploading(false);
    }
  };

  const goBack = () => {
    if (dirty && !window.confirm('Còn thay đổi chưa lưu. Vẫn rời trang?')) return;
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/admin/content');
  };

  return (
    <AdminLayout
      title={exercise ? `Sửa bài #${exercise.id}` : 'Sửa bài'}
      subtitle={exercise ? `${exercise.language === 'ja' ? 'Tiếng Nhật' : 'Tiếng Anh'} · ${skill}` : ''}
      actions={(
        <>
          <button onClick={goBack} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Quay lại
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading || !exercise}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-[#ffffff] bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Đang lưu...' : dirty ? 'Lưu thay đổi' : 'Đã lưu'}
          </button>
        </>
      )}
    >
      <AdminNotice data={msg} />
      {loading && <p className="py-12 text-center text-sm text-slate-400">Đang tải...</p>}

      {!loading && exercise && (
        <>
          <Card title="Thông tin chung">
            <div className="grid gap-4 md:grid-cols-[1fr_160px]">
              <Field label="Tiêu đề">
                <input className={inputCls} value={title} onChange={(e) => change(setTitle)(e.target.value)} />
              </Field>
              <Field label="Thời gian (phút)">
                <input className={inputCls} type="number" min="1" value={minutes} onChange={(e) => change(setMinutes)(e.target.value)} />
              </Field>
            </div>
            {(taskPrompt || isWriting || skill === 'listening' || kind === 'prompt') && (
              <Field label="Đề bài / hướng dẫn" hint={isWriting ? 'Đề bài người học thấy ở khung "Đề bài".' : undefined}>
                <textarea className={`${inputCls} min-h-[110px] leading-6`} value={taskPrompt} onChange={(e) => change(setTaskPrompt)(e.target.value)} />
              </Field>
            )}
            {showPassage && (
              <Field
                label={skill === 'listening' ? 'Transcript / đoạn văn kèm theo' : 'Đoạn văn đọc chung'}
                hint="Để trống nếu mỗi câu có đoạn văn riêng. Dùng [[...]] để gạch chân."
              >
                <textarea className={`${inputCls} min-h-[160px] leading-6`} value={readingPassage} onChange={(e) => change(setReadingPassage)(e.target.value)} />
              </Field>
            )}
            {showSample && (
              <Field label="Bài mẫu" hint="Người học thấy sau khi nộp bài.">
                <textarea className={`${inputCls} min-h-[160px] leading-6`} value={sampleAnswer} onChange={(e) => change(setSampleAnswer)(e.target.value)} />
              </Field>
            )}
          </Card>

          {hasAudio && (
            <Card title="File nghe" subtitle="Nghe lại và thay file nếu sai. File cũ sẽ bị xoá nếu không bài nào khác dùng.">
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-slate-500">File đang dùng</span>
                {exercise.audio_url ? (
                  <>
                    <audio
                      key={`${exercise.audio_url}-${audioVersion}`}
                      controls
                      preload="metadata"
                      src={exercise.audio_url}
                      onError={() => setAudioBroken(true)}
                      onLoadedMetadata={() => setAudioBroken(false)}
                      className="w-full"
                    />
                    <p className="text-[11px] text-slate-400 break-all">{exercise.audio_url}</p>
                    {audioBroken && (
                      <p className="flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-4 py-3">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        Không phát được file này — file không còn trên máy chủ. Chọn file mới và bấm "Thay file nghe".
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-3">Bài này chưa có file nghe.</p>
                )}
              </div>

              <div className="rounded-xl border border-dashed border-slate-200 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 cursor-pointer hover:border-blue-400 hover:text-blue-600">
                    <Music className="w-4 h-4" />
                    {audioFile ? 'Chọn file khác' : 'Chọn file nghe mới'}
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => { setAudioFile(e.target.files?.[0] || null); setAudioStatus(null); e.target.value = ''; }}
                    />
                  </label>
                  <button
                    onClick={handleReplaceAudio}
                    disabled={!audioFile || audioUploading}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-[#ffffff] bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    {audioUploading ? 'Đang tải lên...' : 'Thay file nghe'}
                  </button>
                  <span className="text-[11px] text-slate-400">mp3, wav, m4a, ogg — tối đa 30 MB</span>
                </div>

                {audioFile && (
                  <div className="space-y-1.5">
                    <span className="block text-xs font-semibold text-slate-500">
                      Nghe thử file vừa chọn: <span className="text-slate-700">{audioFile.name}</span> ({(audioFile.size / 1024 / 1024).toFixed(1)} MB) — chưa lưu
                    </span>
                    <audio controls preload="metadata" src={previewUrl} className="w-full" />
                  </div>
                )}

                {audioStatus && (
                  <p className={`flex items-start gap-2 text-sm rounded-xl px-4 py-3 ${
                    audioStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700'
                      : audioStatus.type === 'error' ? 'bg-red-50 text-red-600'
                        : 'bg-blue-50 text-blue-700'
                  }`}>
                    {audioStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      : audioStatus.type === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        : <span className="w-4 h-4 shrink-0 mt-0.5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />}
                    {audioStatus.text}
                  </p>
                )}
              </div>
            </Card>
          )}

          <Card
            title={kind === 'line' ? `Các câu đọc (${questions.length})` : `Câu hỏi (${questions.length})`}
            subtitle={kind === 'mcq' && !isWriting ? 'Bấm vòng tròn bên trái phương án để chọn đáp án đúng.' : undefined}
            right={(
              <button onClick={addQ} className={`${btnSoft} bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-2`}>
                <Plus className="w-3.5 h-3.5" />
                {kind === 'line' ? 'Thêm câu' : 'Thêm câu hỏi'}
              </button>
            )}
          >
            {kind === 'line' && exercise.has_prosody_ref && (
              <p className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Bài này có mốc phát âm của người bản ngữ cho từng câu. Sửa nội dung câu sẽ làm mốc không còn khớp, phần chấm ngữ điệu có thể sai.
              </p>
            )}

            {questions.length === 0 && <p className="text-sm text-slate-400">Chưa có câu nào.</p>}

            {questions.map((q, i) => (
              <div key={i} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-7 min-w-7 px-2 items-center justify-center rounded-full bg-blue-600 text-[#ffffff] text-xs font-bold">
                    {q.id ?? i + 1}
                  </span>
                  <button onClick={() => removeQ(i)} className={`${btnSoft} bg-red-50 text-red-600 hover:bg-red-100`}>
                    <Trash2 className="w-3.5 h-3.5" />
                    Xoá
                  </button>
                </div>

                {kind === 'line' && (
                  <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                    <Field label="Người nói"><input className={inputCls} value={q.speaker || ''} onChange={(e) => updateQ(i, { speaker: e.target.value })} /></Field>
                    <Field label="Câu"><input className={inputCls} value={q.text || ''} onChange={(e) => updateQ(i, { text: e.target.value })} /></Field>
                    <div className="md:col-span-2">
                      <Field label="Phiên âm / nghĩa (tuỳ chọn)"><input className={inputCls} value={q.gloss || ''} onChange={(e) => updateQ(i, { gloss: e.target.value })} /></Field>
                    </div>
                  </div>
                )}

                {kind === 'prompt' && (
                  <>
                    <Field label="Chủ đề"><input className={inputCls} value={q.subTopicHeading || ''} onChange={(e) => updateQ(i, { subTopicHeading: e.target.value })} /></Field>
                    <Field label="Câu hỏi"><textarea className={`${inputCls} min-h-[70px]`} value={q.content || ''} onChange={(e) => updateQ(i, { content: e.target.value })} /></Field>
                  </>
                )}

                {kind === 'mcq' && (
                  <>
                    {(q.section !== undefined || q.passage !== undefined) && (
                      <div className="grid gap-3">
                        {q.section !== undefined && (
                          <Field label="Tiêu đề nhóm (問題...)"><input className={inputCls} value={q.section || ''} onChange={(e) => updateQ(i, { section: e.target.value })} /></Field>
                        )}
                        {q.passage !== undefined && (
                          <Field label="Đoạn văn riêng của câu"><textarea className={`${inputCls} min-h-[90px] leading-6`} value={q.passage || ''} onChange={(e) => updateQ(i, { passage: e.target.value })} /></Field>
                        )}
                      </div>
                    )}
                    <Field label={isWriting ? 'Đề bài' : 'Nội dung câu hỏi'} hint="Dùng [[...]] để gạch chân phần được hỏi.">
                      <textarea className={`${inputCls} min-h-[70px] leading-6`} value={q.question || ''} onChange={(e) => updateQ(i, { question: e.target.value })} />
                    </Field>
                    {q.image && (
                      <img src={assetUrl(q.image)} alt="" className="max-h-40 w-auto rounded-xl border border-slate-200 bg-white object-contain" />
                    )}

                    {!isWriting && (
                      <div className="space-y-2">
                        <span className="block text-xs font-semibold text-slate-500">Phương án</span>
                        {(q.options || []).map((o, oi) => {
                          const isCorrect = correctIndex(q) === oi;
                          return (
                            <div key={oi} className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => chooseCorrect(i, oi)}
                                title="Đặt làm đáp án đúng"
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${isCorrect ? 'border-emerald-500 bg-emerald-500 text-[#ffffff]' : 'border-slate-300 text-slate-500 hover:border-emerald-400'}`}
                              >
                                {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : LETTERS[oi]}
                              </button>
                              <input className={inputCls} value={optionText(o)} onChange={(e) => setOption(i, oi, e.target.value)} />
                              <button type="button" onClick={() => removeOption(i, oi)} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title="Xoá phương án">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                        <button type="button" onClick={() => addOption(i)} className={`${btnSoft} bg-slate-100 text-slate-600 hover:bg-slate-200`}>
                          <Plus className="w-3.5 h-3.5" />
                          Thêm phương án
                        </button>
                        {correctIndex(q) < 0 && <p className="text-xs text-red-600">Chưa chọn đáp án đúng.</p>}
                      </div>
                    )}

                    <Field label="Giải thích (tuỳ chọn)">
                      <textarea className={`${inputCls} min-h-[56px]`} value={q.explanation || ''} onChange={(e) => updateQ(i, { explanation: e.target.value })} />
                    </Field>
                  </>
                )}
              </div>
            ))}
          </Card>

          {problems.length > 0 && dirty && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800 space-y-0.5">
              {problems.slice(0, 6).map((p) => <p key={p}>• {p}</p>)}
              {problems.length > 6 && <p>… và {problems.length - 6} lỗi khác</p>}
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
