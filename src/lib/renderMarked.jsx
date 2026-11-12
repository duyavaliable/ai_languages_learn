/**
 * Hiện chữ có dấu định dạng đã lưu trong câu hỏi — không render HTML lấy từ CSDL.
 *   [[gạch chân]]   (đề JLPT hỏi đúng phần gạch chân)
 *   [b]in đậm[/b]   [i]in nghiêng[/i]   [mark]tô sáng[/mark]   (đề Word: "highlighted statement")
 *   {漢字|かんじ}   furigana (đề PDF quét)
 *   〔★〕 〔_〕       ô trống của câu sắp xếp ★ (đề PDF quét)
 */
const TOKEN = /(\[\[|\]\]|\[\/?(?:b|i|mark)\]|\{[^|{}]+\|[^{}]+\}|〔★〕|〔_〕)/g;

export function renderMarked(text) {
  const parts = String(text || '').split(TOKEN);
  const st = { u: false, b: false, i: false, mark: false };
  const out = [];
  parts.forEach((part, k) => {
    if (part === '[[') { st.u = true; return; }
    if (part === ']]') { st.u = false; return; }
    const tag = part.match(/^\[(\/?)(b|i|mark)\]$/);
    if (tag) { st[tag[2]] = !tag[1]; return; }
    if (!part) return;
    if (part === '〔★〕' || part === '〔_〕') {
      out.push(
        <span key={k} className="mx-0.5 inline-flex h-6 w-12 items-end justify-center border-b-2 border-foreground/60 align-middle text-xs">
          {part === '〔★〕' ? '★' : ''}
        </span>
      );
      return;
    }
    const cls = [
      st.u && 'underline decoration-2 underline-offset-4',
      st.b && 'font-bold',
      st.i && 'italic',
      st.mark && 'rounded bg-yellow-200 px-0.5'
    ].filter(Boolean).join(' ');
    const ruby = part.match(/^\{([^|{}]+)\|([^{}]+)\}$/);
    const inner = ruby ? <ruby>{ruby[1]}<rt className="text-[0.6em]">{ruby[2]}</rt></ruby> : part;
    out.push(cls ? <span key={k} className={cls}>{inner}</span> : <span key={k}>{inner}</span>);
  });
  return out;
}

export const stripMarks = (s) => String(s || '')
  .replace(/\{([^|{}]+)\|[^{}]+\}/g, '$1')
  .replace(/\[\[|\]\]|\[\/?(?:b|i|mark)\]/g, '');
