/**
 * Kết quả chấm bài viết tiếng Anh cơ bản (LanguageTool + chỉ số văn bản,
 * không dùng AI) — dữ liệu từ POST /api/writing/check, xem
 * services/writingService.js ở backend.
 *
 *   <HighlightedEssay>  bài viết, lỗi gạch chân theo nhóm, bấm để xem gợi ý
 *   <WritingFeedback>   nhận xét theo từng tiêu chí + danh sách lỗi
 */
import { useState } from 'react';

const CAT_STYLE = {
  grammar: { mark: 'decoration-red-500 bg-red-50', dot: 'bg-red-500', text: 'text-red-700' },
  spelling: { mark: 'decoration-orange-500 bg-orange-50', dot: 'bg-orange-500', text: 'text-orange-700' },
  punctuation: { mark: 'decoration-sky-500 bg-sky-50', dot: 'bg-sky-500', text: 'text-sky-700' },
  style: { mark: 'decoration-violet-500 bg-violet-50', dot: 'bg-violet-500', text: 'text-violet-700' }
};

const LEVEL = {
  good: { label: 'Tốt', cls: 'bg-emerald-100 text-emerald-700' },
  ok: { label: 'Khá', cls: 'bg-amber-100 text-amber-800' },
  weak: { label: 'Cần cải thiện', cls: 'bg-red-100 text-red-700' }
};

/** Lỗi không chồng nhau, theo thứ tự trong bài (chồng thì giữ lỗi đến trước). */
function nonOverlapping(issues) {
  const out = [];
  let end = -1;
  for (const i of [...issues].sort((a, b) => a.offset - b.offset)) {
    if (i.offset >= end) {
      out.push(i);
      end = i.offset + i.length;
    }
  }
  return out;
}

export function HighlightedEssay({ text, issues, active, onSelect }) {
  const parts = [];
  let pos = 0;
  nonOverlapping(issues).forEach((iss) => {
    if (iss.offset > pos) parts.push(<span key={`t${pos}`}>{text.slice(pos, iss.offset)}</span>);
    const st = CAT_STYLE[iss.category] || CAT_STYLE.style;
    const n = issues.indexOf(iss);
    parts.push(
      <button
        type="button"
        key={`i${iss.offset}`}
        onClick={() => onSelect(n)}
        title={`${iss.categoryLabel}: ${iss.message}${iss.replacements.length ? `\nGợi ý: ${iss.replacements.join(', ')}` : ''}`}
        className={`rounded-sm underline decoration-2 underline-offset-4 ${st.mark} ${active === n ? 'ring-2 ring-primary/50' : ''}`}
      >
        {text.slice(iss.offset, iss.offset + iss.length) || '·'}
      </button>
    );
    pos = iss.offset + iss.length;
  });
  if (pos < text.length) parts.push(<span key="tend">{text.slice(pos)}</span>);
  return (
    <div className="min-h-[420px] whitespace-pre-wrap rounded-3xl border border-border bg-background p-5 text-sm leading-8">
      {parts}
    </div>
  );
}

export function WritingFeedback({ result, active, onSelect }) {
  const [showAll, setShowAll] = useState(false);
  const { counts, criteria, issues } = result;
  const total = issues.length;
  const shown = showAll ? issues : issues.slice(0, 12);

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-border bg-card p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Nhận xét bài viết</div>
          <span className="text-xs text-muted-foreground">chấm bằng luật · không dùng AI</span>
        </div>
        <div className="space-y-2.5">
          {criteria.map((c) => (
            <div key={c.key} className="rounded-2xl border border-border bg-secondary/35 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{c.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${LEVEL[c.level].cls}`}>
                  {LEVEL[c.level].label}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{c.value}</div>
              <p className="mt-1 text-sm leading-6 text-foreground/85">{c.note}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[24px] border border-border bg-card p-5 shadow-card">
        <div className="mb-2 text-sm font-semibold">Lỗi hệ thống bắt được ({total})</div>
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {Object.entries(counts).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${CAT_STYLE[k].dot}`} />
              {{ grammar: 'Ngữ pháp', spelling: 'Chính tả', punctuation: 'Dấu câu & viết hoa', style: 'Cách diễn đạt' }[k]}: {v}
            </span>
          ))}
        </div>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Không tìm thấy lỗi ngữ pháp/chính tả nào theo bộ luật.</p>
        ) : (
          <div className="space-y-2">
            {shown.map((iss) => {
              const n = issues.indexOf(iss);
              const st = CAT_STYLE[iss.category] || CAT_STYLE.style;
              return (
                <button
                  type="button"
                  key={`${iss.offset}-${n}`}
                  onClick={() => onSelect(n)}
                  className={`block w-full rounded-2xl border px-3 py-2 text-left text-sm transition-smooth ${active === n ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/60'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
                    <span className={`text-xs font-semibold ${st.text}`}>{iss.categoryLabel}</span>
                    <span className="truncate font-medium">“{iss.text}”</span>
                    {iss.replacements.length > 0 && (
                      <span className="truncate text-emerald-700">→ {iss.replacements.join(' / ')}</span>
                    )}
                  </div>
                  {active === n && <p className="mt-1 text-xs leading-5 text-muted-foreground">{iss.message}</p>}
                </button>
              );
            })}
            {total > 12 && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-primary">
                {showAll ? 'Thu gọn' : `Xem thêm ${total - 12} lỗi`}
              </button>
            )}
          </div>
        )}
        <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
          Lời giải thích lỗi lấy nguyên từ bộ luật LanguageTool (tiếng Anh).
        </p>
      </div>

      <p className="px-1 text-xs leading-5 text-muted-foreground">{result.disclaimer}</p>
    </div>
  );
}
