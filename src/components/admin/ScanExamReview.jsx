import { useEffect, useMemo, useState } from 'react';
import { renderMarked, stripMarks } from '../../lib/renderMarked';
import { assetUrl } from '../../lib/asset';
import { SectionHeading, PassageBlock, QuestionImages, isLabelOnly } from '../ExamBlocks';

const MODE_LABEL = {
  text: 'hiện bằng chữ',
  image: 'hiện ảnh gốc (máy đọc không chắc)',
  picture: 'câu có tranh (ảnh gốc)',
  audio: 'chỉ nghe'
};

/**
 * Màn hình DUYỆT đề PDF quét trước khi lưu (chỉ admin).
 *
 * - Hiện đề đúng như người học sẽ thấy (cùng khối hiển thị với trang làm bài).
 * - Câu máy đọc không chắc đã tự chuyển sang ẢNH GỐC kèm lý do; câu hiện bằng chữ có thể
 *   chuyển sang ảnh gốc bằng một nút nếu admin thấy chữ sai.
 * - Đáp án: gắn tự động khi bảng đáp án khớp; chỗ chưa có thì bấm vào phương án để chọn.
 * - Bên cạnh là trang gốc của PDF để đối chiếu.
 */
/**
 * File nghe của đề: MỘT file cho cả đề (`wholeAudio`) và/hoặc file RIÊNG cho từng phần (`partAudio`,
 * khoá theo tiêu đề phần). Phần có file riêng dùng file riêng; phần để trống dùng file chung.
 * Trả về danh sách file gửi lên server + chỉ số file của từng câu (null = cả đề dùng một file chung).
 */
export function audioPlan(questions, wholeAudio, partAudio = {}) {
  const anyPart = questions.some((q) => partAudio[q.section]);
  if (!anyPart) return { files: wholeAudio ? [wholeAudio] : [], indexes: null };
  const files = [];
  const at = new Map();
  const indexes = questions.map((q) => {
    const f = partAudio[q.section] || wholeAudio;
    if (!f) return null;
    if (!at.has(f)) { at.set(f, files.length); files.push(f); }
    return at.get(f);
  });
  return { files, indexes };
}

/** Nút nghe thử file đã chọn (URL tạm trong trình duyệt, tự thu hồi). */
// URL tạo VÀ thu hồi trong cùng một effect: (useMemo + effect thu hồi riêng làm StrictMode thu hồi URL
// ngay sau lần chạy thử đầu, trình phát nhận URL đã chết nên không nghe được)
function AudioPreview({ file }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!file) { setUrl(null); return undefined; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? <audio key={url} controls preload="metadata" src={url} className="h-8 max-w-[16rem]" /> : null;
}

/** Hộp báo lỗi lưu bài ở GIỮA màn hình (phủ mờ nền); đóng bằng nút, bấm ra ngoài hoặc phím Esc. */
function SaveErrorDialog({ error }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { setOpen(true); }, [error.id]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // chỉ đóng hộp; dòng lỗi đỏ dưới nút Lưu vẫn còn để nhắc
  const close = () => setOpen(false);
  if (!open) return null;
  const list = (error.problems || []).slice(0, 12);
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 p-4" onClick={close} role="presentation">
      <div
        role="alertdialog" aria-modal="true" aria-labelledby="save-error-title"
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xl font-bold text-rose-700">!</span>
          <div className="min-w-0 flex-1">
            <h3 id="save-error-title" className="text-lg font-bold text-slate-900">Lưu bài thất bại</h3>
            <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-700">{error.text}</p>
            {list.length > 0 && (
              <ul className="mt-2 max-h-56 list-disc overflow-y-auto pl-5 text-sm text-rose-800">
                {list.map((p, i) => <li key={i}>{p}</li>)}
                {(error.problems || []).length > list.length && <li>… và {error.problems.length - list.length} lỗi khác</li>}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">Đề vẫn được giữ nguyên trên màn duyệt — sửa rồi bấm Lưu lại.</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" autoFocus onClick={close} className="rounded-xl bg-slate-800 px-5 py-2 text-sm font-semibold text-white">Đã hiểu</button>
        </div>
      </div>
    </div>
  );
}

export default function ScanExamReview({ data, onChange, onSave, onCancel, onAttachKey, saving, saveError, needAudio }) {
  const [editing, setEditing] = useState(null);
  const [keyFile, setKeyFile] = useState(null);
  const [keyPages, setKeyPages] = useState('');
  const [showPages, setShowPages] = useState(true);
  const [emptyCounts, setEmptyCounts] = useState({});
  const questions = data.questions || [];
  const partAudio = data.partAudio || {};
  const wholeAudio = data.wholeAudio || null;

  const problems = useMemo(() => {
    const out = [];
    questions.forEach((q) => {
      const opts = q.options || [];
      // cùng điều kiện với server (createScanExam): bài nghe thì câu hỏi nằm trong băng nên không bắt buộc chữ
      if (!needAudio && !String(q.question || '').trim() && !q.image && !q.passage && !q.passageImage) out.push(`Câu ${q.id}: không có nội dung`);
      if (opts.length < 2 || opts.some((o) => !stripMarks(o.value).trim())) out.push(`Câu ${q.id}: phương án thiếu hoặc rỗng`);
      if (!opts.some((o) => o.value === q.correctAnswer)) out.push(`Câu ${q.id}: chưa chọn đáp án`);
    });
    if (needAudio) {
      const missing = [...new Set(questions.map((q) => q.section))].filter((s) => !partAudio[s] && !wholeAudio).length;
      if (missing) out.push(wholeAudio || Object.keys(partAudio).length ? `Bài nghe: còn ${missing} phần chưa có file nghe` : 'Bài nghe: chưa chọn file âm thanh');
    }
    if ((data.emptySections || []).length) out.push('Còn mục chưa nhập số câu');
    return out;
  }, [questions, needAudio, partAudio, wholeAudio, data.emptySections]);

  // Các PHẦN của đề: câu liền nhau cùng tiêu đề mục (giống cách server tách bài khi lưu).
  const groups = useMemo(() => {
    const out = [];
    questions.forEach((q) => {
      const last = out[out.length - 1];
      if (last && last.section === q.section) last.count += 1;
      else out.push({ section: q.section, sectionImage: q.sectionImage, count: 1, first: q });
    });
    return out;
  }, [questions]);
  // Danh sách phần hiện cho admin: phần có câu + mục chỉ nghe chưa có câu (chưa biết số câu), xếp theo trang
  const rows = useMemo(() => {
    const out = groups.map((g, gi) => ({ kind: 'group', g, gi, page: g.first.review?.page ?? null }));
    (data.emptySections || []).forEach((s) => out.push({ kind: 'empty', s, page: s.page ?? null }));
    return out
      .map((r, k) => ({ ...r, k }))
      .sort((a, b) => (a.page ?? 1e9) - (b.page ?? 1e9) || a.k - b.k);
  }, [groups, data.emptySections]);
  const split = groups.length > 1 && data.split !== false;
  const partTitle = (i) => (data.partTitles || [])[i] ?? '';

  const setPartAudio = (section, file) => {
    const next = { ...partAudio };
    if (file) next[section] = file; else delete next[section];
    onChange({ ...data, partAudio: next });
  };

  // Mục nghe không in câu nào: admin nhập số câu -> tạo câu "chỉ nghe" (nút 1..N), chèn đúng chỗ theo trang.
  const addEmptySection = (s) => {
    const n = Math.max(1, Math.min(50, Number(emptyCounts[s.section]) || 0));
    const labels = Array.from({ length: s.nOptions }, (_x, k) => String(k + 1));
    const made = Array.from({ length: n }, (_x, k) => ({
      id: k + 1, section: s.section, sectionImage: s.sectionImage, passage: '', passageImage: null,
      question: '', image: null, images: [], display: 'audio', correctAnswer: '',
      options: labels.map((l) => ({ label: l, value: l })),
      review: { reasons: [], sectionCheck: s.sectionCheck, passageCheck: [], answerNote: 'Chưa có đáp án: không có bảng đáp án', page: s.page, labels }
    }));
    let at = questions.length;
    if (s.page != null) {
      const after = questions.findIndex((q) => q.review?.page != null && q.review.page > s.page);
      if (after >= 0) at = after;
    }
    const next = [...questions.slice(0, at), ...made, ...questions.slice(at)];
    onChange({ ...data, questions: next, emptySections: data.emptySections.filter((x) => x !== s) });
  };

  const counts = useMemo(() => {
    const c = {};
    questions.forEach((q) => { c[q.display] = (c[q.display] || 0) + 1; });
    return c;
  }, [questions]);
  const answered = questions.filter((q) => (q.options || []).some((o) => o.value === q.correctAnswer)).length;
  const needKey = answered < questions.length || (data.emptySections || []).length > 0;

  const update = (idx, patch) => onChange({ ...data, questions: questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)) });

  // Câu hiện bằng chữ -> ảnh gốc: giữ đúng VỊ TRÍ đáp án đã chọn, phương án thành nút số / chữ cái.
  const toImage = (idx) => {
    const q = questions[idx];
    const at = (q.options || []).findIndex((o) => o.value === q.correctAnswer);
    const labels = q.review?.labels?.length ? q.review.labels : q.options.map((o) => o.label);
    const options = labels.map((l) => ({ label: l, value: l }));
    update(idx, {
      display: 'image', question: '', image: q.review.crop, images: [], options,
      correctAnswer: at >= 0 ? options[at]?.value || '' : '',
      review: { ...q.review, reasons: ['admin chuyển sang ảnh gốc'] }
    });
    setEditing(null);
  };

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold text-slate-800">{data.fileName}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1">{questions.length} câu</span>
        {Object.entries(counts).map(([m, n]) => (
          <span key={m} className={`rounded-full px-3 py-1 ${m === 'image' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100'}`}>{n} câu {MODE_LABEL[m] || m}</span>
        ))}
        <span className={`rounded-full px-3 py-1 ${answered === questions.length ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          {answered}/{questions.length} câu có đáp án
        </span>
        <label className="ml-auto flex items-center gap-2">
          Thời gian (phút)
          <input
            type="number" min="1" className="w-20 rounded-lg border border-slate-300 px-2 py-1"
            value={Math.round((data.timeLimitSec || 0) / 60) || ''}
            onChange={(e) => onChange({ ...data, timeLimitSec: Number(e.target.value) * 60 })}
          />
        </label>
      </div>

      {(data.answerLog || []).length > 0 && (
        <ul className="mt-3 list-disc rounded-xl bg-slate-50 py-2 pl-8 pr-3 text-xs leading-6 text-slate-700">
          {data.answerLog.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}

      {needKey && onAttachKey && (
        <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm">
          <p className="font-semibold text-rose-900">
            {answered < questions.length ? `Còn ${questions.length - answered}/${questions.length} câu chưa có đáp án` : 'Đã đủ đáp án'}
            {(data.emptySections || []).length > 0 && ` · ${data.emptySections.length} phần chỉ nghe chưa biết số câu`}
            {' '}— gắn file đáp án để máy tự điền (không phải quét lại đề, chỉ mất vài giây):
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <input type="file" accept=".pdf,application/pdf" onChange={(e) => setKeyFile(e.target.files?.[0] || null)} />
            <input
              className="w-56 rounded-lg border border-slate-300 px-2 py-1"
              placeholder={keyFile ? 'trang đáp án (trống = mọi trang)' : 'hoặc trang đáp án trong file đề, vd 17-18'}
              value={keyPages}
              onChange={(e) => setKeyPages(e.target.value)}
            />
            <button
              type="button" disabled={!keyFile && !keyPages.trim()}
              onClick={() => onAttachKey(keyFile, keyPages.trim())}
              className="rounded-lg bg-rose-700 px-3 py-1 font-semibold text-white disabled:opacity-50"
            >
              Đọc đáp án
            </button>
          </div>
          <p className="mt-1 text-xs text-rose-900">File nghe và tên phần đã chọn được giữ lại; chữ đã sửa tay trong câu sẽ trở về bản máy đọc.</p>
        </div>
      )}

      {rows.length > 1 && (
        <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm">
          <p className="font-semibold text-teal-900">Đề có {rows.length} phần. Cách lưu:</p>
          <div className="mt-1 flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input type="radio" checked={split} onChange={() => onChange({ ...data, split: true })} />
              Tách thành {rows.length} bài (mỗi phần một bài)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={!split} onChange={() => onChange({ ...data, split: false })} />
              Giữ thành một bài gồm cả {rows.length} phần
            </label>
          </div>
          <div className="mt-2 space-y-2">
            {rows.map((r, i) => {
              if (r.kind === 'empty') {
                const s = r.s;
                return (
                  <div key={'empty' + s.section} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs">
                    <span className="w-14 font-semibold text-amber-900">Phần {i + 1}</span>
                    <span className="w-24 truncate text-slate-500" title={s.section}>{(s.section || '(ảnh)').split('\n')[0]}</span>
                    <span className="text-amber-900">không in câu nào (chỉ nghe) — chưa biết số câu: gắn file đáp án ở trên, hoặc nhập</span>
                    <input
                      type="number" min="1" max="50" className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                      placeholder="số câu"
                      value={emptyCounts[s.section] || ''}
                      onChange={(e) => setEmptyCounts((c) => ({ ...c, [s.section]: e.target.value }))}
                    />
                    <span className="text-slate-600">câu, mỗi câu {s.nOptions} phương án</span>
                    <button
                      type="button" disabled={!(Number(emptyCounts[s.section]) > 0)}
                      onClick={() => addEmptySection(s)}
                      className="rounded-lg bg-amber-600 px-3 py-1 font-semibold text-white disabled:opacity-50"
                    >
                      Tạo câu
                    </button>
                  </div>
                );
              }
              const { g, gi } = r;
              const own = partAudio[g.section] || null;
              return (
                <div key={g.section + gi} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/70 px-2 py-1.5 text-xs">
                  <span className="w-14 font-semibold text-teal-900">Phần {i + 1}</span>
                  <span className="w-12 text-slate-600">{g.count} câu</span>
                  <span className="w-24 truncate text-slate-500" title={g.section}>{(g.section || '(ảnh)').split('\n')[0]}</span>
                  {split && (
                    <input
                      className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-2 py-1"
                      placeholder={`(tên bài) — Phần ${gi + 1}`}
                      value={partTitle(gi)}
                      onChange={(e) => {
                        const t = [...(data.partTitles || [])];
                        t[gi] = e.target.value;
                        onChange({ ...data, partTitles: t });
                      }}
                    />
                  )}
                  {needAudio && (
                    <span className="flex flex-wrap items-center gap-2">
                      <label className={`cursor-pointer rounded-lg border px-2 py-1 font-semibold ${own ? 'border-sky-400 bg-sky-50 text-sky-900' : 'border-slate-300 bg-white text-slate-700'}`}>
                        {own ? `🔊 ${own.name}` : 'Chọn file nghe của phần'}
                        <input
                          type="file" accept="audio/*" className="hidden"
                          onChange={(e) => { setPartAudio(g.section, e.target.files?.[0] || null); e.target.value = ''; }}
                        />
                      </label>
                      {own ? (
                        <>
                          <AudioPreview file={own} />
                          <button type="button" className="text-rose-700" onClick={() => setPartAudio(g.section, null)}>Bỏ</button>
                        </>
                      ) : (
                        <span className={wholeAudio ? 'text-slate-500' : 'text-rose-700'}>
                          {wholeAudio ? 'dùng file chung của cả đề' : 'chưa có file'}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
            {split && <p className="text-xs text-slate-600">Để trống tên thì dùng "tên bài — Phần N". Thời gian làm bài chia theo số câu của từng phần (ít nhất 5 phút).</p>}
          </div>
        </div>
      )}

      {needAudio && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
          <span className="font-semibold text-sky-900">1 file nghe cho cả đề</span>
          <label className={`cursor-pointer rounded-lg border px-2 py-1 text-xs font-semibold ${wholeAudio ? 'border-sky-400 bg-white text-sky-900' : 'border-slate-300 bg-white text-slate-700'}`}>
            {wholeAudio ? `🔊 ${wholeAudio.name}` : 'Chọn file'}
            <input
              type="file" accept="audio/*" className="hidden"
              onChange={(e) => { onChange({ ...data, wholeAudio: e.target.files?.[0] || null }); e.target.value = ''; }}
            />
          </label>
          {wholeAudio && (
            <>
              <AudioPreview file={wholeAudio} />
              <button type="button" className="text-xs text-rose-700" onClick={() => onChange({ ...data, wholeAudio: null })}>Bỏ</button>
            </>
          )}
          <span className="w-full text-xs text-sky-900">
            {groups.length > 1
              ? 'Phần nào đã chọn file riêng ở trên thì dùng file riêng; phần để trống dùng file chung này.'
              : 'File nghe của bài.'}
          </span>
        </div>
      )}

      {rows.length <= 1 && (data.emptySections || []).map((s) => (
        <div key={s.section} className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-900">Mục không in câu nào (chỉ nghe) và không có bảng đáp án để biết số câu:</p>
          <div className="mt-2"><SectionHeading question={s} first /></div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            Số câu của mục
            <input
              type="number" min="1" max="50" className="w-20 rounded-lg border border-slate-300 px-2 py-1"
              value={emptyCounts[s.section] || ''}
              onChange={(e) => setEmptyCounts((c) => ({ ...c, [s.section]: e.target.value }))}
            />
            <span className="text-xs text-slate-600">mỗi câu {s.nOptions} phương án</span>
            <button
              type="button" disabled={!(Number(emptyCounts[s.section]) > 0)}
              onClick={() => addEmptySection(s)}
              className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              Tạo câu
            </button>
          </div>
        </div>
      ))}

      <div className={`mt-4 grid gap-4 ${showPages && data.pageImages?.length ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]' : ''}`}>
        <div className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
          {questions.map((q, idx) => {
            const prev = questions[idx - 1];
            const showSection = (q.section || q.sectionImage) && q.section !== prev?.section;
            const showPassage = (q.passage || q.passageImage) && q.passage !== prev?.passage;
            const isEditing = editing === idx;
            const opts = q.options || [];
            const only = isLabelOnly(opts);
            const flags = [
              ...(q.display === 'image' && q.review?.reasons?.length ? [`Hiện ảnh gốc vì ${q.review.reasons.join('; ')}`] : []),
              ...(showSection && q.sectionImage && q.review?.sectionCheck?.length ? [`Lời hướng dẫn hiện ảnh gốc vì ${q.review.sectionCheck.join('; ')}`] : []),
              ...(showPassage && q.passageImage && q.review?.passageCheck?.length ? [`Đoạn văn hiện ảnh gốc vì ${q.review.passageCheck.join('; ')}`] : []),
              ...(q.review?.answerNote ? [q.review.answerNote] : [])
            ];
            return (
              <div key={idx} className="space-y-2">
                {showSection && <SectionHeading question={q} first={idx === 0} />}
                {showPassage && <PassageBlock question={q} />}
                <div className={`rounded-xl border p-3 ${opts.some((o) => o.value === q.correctAnswer) ? 'border-slate-200' : 'border-amber-400 bg-amber-50/40'}`}>
                  {flags.map((f, k) => (
                    <p key={k} className="mb-2 rounded-lg bg-amber-100 px-2 py-1 text-xs text-amber-900">{f}</p>
                  ))}
                  {isEditing ? (
                    <div className="space-y-2 text-sm">
                      <textarea
                        className="w-full rounded-lg border border-slate-300 p-2"
                        rows={2}
                        value={q.question}
                        onChange={(e) => update(idx, { question: e.target.value })}
                      />
                      {opts.map((o, k) => (
                        <div key={k} className="flex items-center gap-2">
                          <span className="w-5 font-bold">{o.label}</span>
                          <input
                            className="flex-1 rounded-lg border border-slate-300 px-2 py-1"
                            value={o.value}
                            onChange={(e) => {
                              const v = e.target.value;
                              update(idx, {
                                options: opts.map((x, j) => (j === k ? { ...x, value: v } : x)),
                                correctAnswer: q.correctAnswer === o.value ? v : q.correctAnswer
                              });
                            }}
                          />
                        </div>
                      ))}
                      <p className="text-xs text-slate-500">Định dạng: [[gạch chân]] {'{漢字|かんじ}'} furigana, 〔★〕 〔_〕 ô trống</p>
                      <div className="flex gap-2">
                        <button type="button" className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-semibold text-white" onClick={() => setEditing(null)}>Xong</button>
                        {q.review?.crop && (
                          <button type="button" className="rounded-lg border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-800" onClick={() => toImage(idx)}>
                            Chữ sai — hiện bằng ảnh gốc
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-2 text-sm">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-bold text-white">{q.id ?? '?'}</span>
                        <div className="flex-1 whitespace-pre-line pt-0.5 font-medium leading-7">
                          {q.question ? renderMarked(q.question) : (
                            <span className="text-xs text-slate-500">
                              {q.display === 'text' && needAudio ? 'câu hỏi nằm trong băng, phương án in bằng chữ' : MODE_LABEL[q.display]}
                            </span>
                          )}
                        </div>
                        {q.review?.page ? <span className="rounded bg-slate-100 px-2 text-xs">trang {q.review.page}</span> : null}
                        {q.display === 'text' && <button type="button" className="text-xs text-sky-700" onClick={() => setEditing(idx)}>Sửa</button>}
                      </div>
                      <div className="mt-2 pl-9">
                        <QuestionImages question={q} number={q.id} />
                      </div>
                      <div className={`mt-2 grid gap-1 pl-9 text-sm ${only ? 'grid-cols-4' : 'sm:grid-cols-2'}`}>
                        {opts.map((o, k) => {
                          const on = q.correctAnswer === o.value;
                          return (
                            <button
                              type="button" key={k}
                              title="Bấm để chọn làm đáp án đúng"
                              onClick={() => update(idx, { correctAnswer: o.value })}
                              className={`flex items-start gap-2 rounded-lg border px-2 py-1 text-left ${only ? 'justify-center' : ''} ${on ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-400'}`}
                            >
                              <span className={`font-bold ${on ? 'text-emerald-700' : ''}`}>{o.label}{only ? '' : '.'}</span>
                              {!only && <span>{renderMarked(o.value)}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {showPages && data.pageImages?.length > 0 && (
          <div className="max-h-[75vh] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
            <p className="text-xs font-semibold text-slate-600">Trang gốc trong PDF (để đối chiếu)</p>
            {data.pageImages.map((p) => (
              <img key={p.page} src={assetUrl(p.url)} alt={`Trang ${p.page}`} loading="lazy" className="w-full rounded border border-slate-200 bg-white" />
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || problems.length > 0}
          className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Đang lưu...' : split ? `Lưu ${groups.length} bài (${questions.length} câu)` : `Lưu bài (${questions.length} câu)`}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Huỷ</button>
        {data.pageImages?.length > 0 && (
          <button type="button" onClick={() => setShowPages((v) => !v)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">
            {showPages ? 'Ẩn trang gốc' : 'Hiện trang gốc'}
          </button>
        )}
        {problems.length > 0 && (
          <span className="text-xs text-rose-700">Chưa lưu được: {problems.slice(0, 3).join('; ')}{problems.length > 3 ? ` … (+${problems.length - 3})` : ''}</span>
        )}
      </div>
      {saving && (
        <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">Đang gửi đề và file nghe lên máy chủ… (file nghe lớn có thể mất một lúc)</p>
      )}
      {!saving && saveError && (
        <p className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">Lưu thất bại: {saveError.text}</p>
      )}
      {!saving && saveError && <SaveErrorDialog error={saveError} />}
    </div>
  );
}
