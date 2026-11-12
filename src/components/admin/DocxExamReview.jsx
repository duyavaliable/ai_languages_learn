import { useMemo, useState } from 'react';
import { renderMarked, stripMarks } from '../../lib/renderMarked';

/**
 * Màn hình DUYỆT đề Word trước khi lưu (chỉ admin).
 *
 * - Hiện đề đúng như người học sẽ thấy (cùng hàm hiển thị với trang làm bài).
 * - "Đã tự sửa": lỗi gõ có sẵn trong file mà máy sửa được chắc chắn — chỉ để xem.
 * - "Cần xem lại": chỗ máy không tự sửa được — admin sửa trực tiếp ở câu tương ứng.
 * - Không cho lưu khi còn câu thiếu phương án hoặc chưa có đáp án.
 */
export default function DocxExamReview({ data, onChange, onSave, onCancel, saving, needAudio, audioFile }) {
  const [showFixes, setShowFixes] = useState(false);
  const [editing, setEditing] = useState(null);
  const [openPassage, setOpenPassage] = useState({});
  const questions = data.questions || [];

  const problems = useMemo(() => {
    const out = [];
    questions.forEach((q) => {
      const opts = q.options || [];
      if (opts.length < 2 || opts.some((o) => !stripMarks(o).trim())) out.push(`Câu ${q.id}: phương án thiếu hoặc rỗng`);
      if (!opts.map((_o, k) => String.fromCharCode(65 + k)).includes(String(q.correctAnswer || '').toUpperCase())) out.push(`Câu ${q.id}: chưa chọn đáp án`);
    });
    if (needAudio && !audioFile) out.push('Bài nghe: chưa chọn file âm thanh');
    return out;
  }, [questions, needAudio, audioFile]);

  const update = (idx, patch) => {
    const next = questions.map((q, i) => (i === idx ? { ...q, ...patch } : q));
    onChange({ ...data, questions: next });
  };
  const updatePassage = (oldText, text) => {
    onChange({ ...data, questions: questions.map((q) => (q.passage === oldText ? { ...q, passage: text } : q)) });
  };

  const fixCount = (data.fixes || []).length;
  const warnCount = (data.warnings || []).length;

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold text-slate-800">{data.fileName}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1">{questions.length} câu</span>
        <span className={`rounded-full px-3 py-1 ${data.answersAttached ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          {data.answersAttached ? 'Đáp án đã gắn từ bảng đáp án' : 'Chưa có đáp án đầy đủ — chọn tay'}
        </span>
        <button type="button" onClick={() => setShowFixes((v) => !v)} className="rounded-full bg-sky-100 px-3 py-1 text-sky-800">
          Đã tự sửa {fixCount} chỗ {showFixes ? '▲' : '▼'}
        </button>
        <span className={`rounded-full px-3 py-1 ${warnCount ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
          {warnCount ? `Cần xem lại ${warnCount} chỗ` : 'Không có chỗ cần xem lại'}
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

      {showFixes && fixCount > 0 && (
        <ul className="mt-3 max-h-56 list-disc overflow-y-auto rounded-xl bg-sky-50 py-2 pl-8 pr-3 text-xs leading-6 text-slate-700">
          {data.fixes.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      )}
      {warnCount > 0 && (
        <ul className="mt-3 list-disc rounded-xl bg-rose-50 py-2 pl-8 pr-3 text-xs leading-6 text-rose-800">
          {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}

      <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        {questions.map((q, idx) => {
          const prev = questions[idx - 1];
          const showSection = q.section && q.section !== prev?.section;
          const showPassage = q.passage && q.passage !== prev?.passage;
          const isEditing = editing === idx;
          const labels = (q.options || []).map((_o, k) => String.fromCharCode(65 + k));
          return (
            <div key={idx} className="space-y-2">
              {showSection && <h4 className="pt-2 text-sm font-bold text-teal-700">{q.section}</h4>}
              {showPassage && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-7 text-slate-700">
                  {openPassage[idx] === 'edit' ? (
                    <textarea
                      className="h-64 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs"
                      defaultValue={q.passage}
                      onBlur={(e) => { updatePassage(q.passage, e.target.value); setOpenPassage((s) => ({ ...s, [idx]: 'open' })); }}
                    />
                  ) : (
                    <div className={`whitespace-pre-line ${openPassage[idx] ? '' : 'line-clamp-4'}`}>{renderMarked(q.passage)}</div>
                  )}
                  <div className="mt-1 flex gap-3 text-xs">
                    <button type="button" className="text-sky-700" onClick={() => setOpenPassage((s) => ({ ...s, [idx]: s[idx] ? null : 'open' }))}>
                      {openPassage[idx] ? 'Thu gọn' : 'Xem toàn bộ đoạn văn'}
                    </button>
                    <button type="button" className="text-sky-700" onClick={() => setOpenPassage((s) => ({ ...s, [idx]: 'edit' }))}>Sửa đoạn văn</button>
                  </div>
                </div>
              )}
              <div className={`rounded-xl border p-3 ${q.correctAnswer ? 'border-slate-200' : 'border-amber-400 bg-amber-50/40'}`}>
                {isEditing ? (
                  <div className="space-y-2 text-sm">
                    <textarea
                      className="w-full rounded-lg border border-slate-300 p-2"
                      rows={2}
                      value={q.question}
                      onChange={(e) => update(idx, { question: e.target.value })}
                    />
                    {(q.options || []).map((o, k) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="w-5 font-bold">{labels[k]}</span>
                        <input
                          className="flex-1 rounded-lg border border-slate-300 px-2 py-1"
                          value={o}
                          onChange={(e) => update(idx, { options: q.options.map((x, j) => (j === k ? e.target.value : x)) })}
                        />
                      </div>
                    ))}
                    <p className="text-xs text-slate-500">Định dạng: [[gạch chân]] [b]đậm[/b] [i]nghiêng[/i] [mark]tô sáng[/mark]</p>
                    <button type="button" className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-semibold text-white" onClick={() => setEditing(null)}>Xong</button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2 text-sm">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-bold text-white">{q.id}</span>
                      <div className="flex-1 whitespace-pre-line pt-0.5 font-medium">{renderMarked(q.question)}</div>
                      {q.level ? <span className="rounded bg-slate-100 px-2 text-xs">độ khó {q.level}</span> : null}
                      <button type="button" className="text-xs text-sky-700" onClick={() => setEditing(idx)}>Sửa</button>
                    </div>
                    <div className="mt-2 grid gap-1 pl-9 text-sm sm:grid-cols-2">
                      {(q.options || []).map((o, k) => {
                        const on = String(q.correctAnswer).toUpperCase() === labels[k];
                        return (
                          <button
                            type="button" key={k}
                            title="Bấm để chọn làm đáp án đúng"
                            onClick={() => update(idx, { correctAnswer: labels[k] })}
                            className={`flex items-start gap-2 rounded-lg border px-2 py-1 text-left ${on ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-400'}`}
                          >
                            <span className={`font-bold ${on ? 'text-emerald-700' : ''}`}>{labels[k]}.</span>
                            <span>{renderMarked(o)}</span>
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || problems.length > 0}
          className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Đang lưu...' : `Lưu bài (${questions.length} câu)`}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Huỷ</button>
        {problems.length > 0 && (
          <span className="text-xs text-rose-700">Chưa lưu được: {problems.slice(0, 3).join('; ')}{problems.length > 3 ? ` … (+${problems.length - 3})` : ''}</span>
        )}
      </div>
    </div>
  );
}
