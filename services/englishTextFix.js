// Tự sửa lỗi gõ / lỗi chuyển đổi nằm sẵn trong đề tiếng Anh (file Word đã có chữ chính xác).
//
// Nguyên tắc: CHỈ sửa khi chắc — có đúng một cách sửa và từ điển ủng hộ rõ ràng.
// Mỗi chỗ sửa được ghi vào `fixes` (admin xem được, không bắt buộc duyệt).
// Chỗ không chắc -> `warnings` để admin duyệt.
// Không bao giờ đụng vào: tên riêng (viết hoa giữa câu), từ viết tắt (>= 2 chữ hoa),
// từ đang được hỏi trong ngoặc kép, cách viết lặp lại nhất quán (>= 2 lần) trong đề.
//
// Từ điển: bảng tần suất từ tiếng Anh (thang Zipf) xuất từ dự án wordfreq,
// lưu offline ở services/data/en_wordfreq.txt — không gọi dịch vụ ngoài.
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
let ZIPF = null;

function loadZipf() {
  if (ZIPF) return ZIPF;
  ZIPF = new Map();
  const raw = readFileSync(path.join(here, 'data', 'en_wordfreq.txt'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const tab = line.indexOf('\t');
    const z = Number(line.slice(0, tab)) / 10;
    for (const w of line.slice(tab + 1).split(' ')) if (w) ZIPF.set(w, z);
  }
  return ZIPF;
}

const z = (w) => loadZipf().get(String(w).toLowerCase()) || 0;

const FUNC = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'is', 'on', 'at', 'by', 'and', 'or', 'as', 'it', 'be', 'for',
  'each', 'with', 'from', 'that', 'this', 'are', 'was', 'not', 'his', 'her', 'its', 'their', 'our']);
const UNITS = new Set(['st', 'nd', 'rd', 'th', 'km', 'kg', 'cm', 'mm', 'ml', 'pm', 'am', 'ppm', 'mph', 'kph', 'mb', 'gb', 'kb', 'mhz', 'ghz']);

const isWord = (w, th = 3.0) => FUNC.has(w.toLowerCase()) || z(w) >= th;

/** "isclosest" -> "is closest". null nếu không tách được, 'AMBIG' nếu có hai cách ngang nhau. */
function bestSplit(w) {
  const lw = w.toLowerCase();
  const cands = [];
  for (let k = 1; k < lw.length; k += 1) {
    const a = lw.slice(0, k);
    const b = lw.slice(k);
    if (a.length === 1 && a !== 'a') continue;
    if (b.length < 2) continue;
    if (isWord(a) && isWord(b) && (FUNC.has(a) || FUNC.has(b) || (a.length >= 3 && b.length >= 3))) {
      const sc = Math.min(FUNC.has(a) ? 7 : z(a), FUNC.has(b) ? 7 : z(b));
      cands.push([sc + (FUNC.has(a) || FUNC.has(b) ? 1.0 : 0), k]);
    }
  }
  if (!cands.length) return null;
  cands.sort((x, y) => y[0] - x[0]);
  if (cands.length > 1 && cands[0][0] - cands[1][0] < 0.5) return 'AMBIG';
  const k = cands[0][1];
  return `${w.slice(0, k)} ${w.slice(k)}`;
}

function edits1(w) {
  const L = 'abcdefghijklmnopqrstuvwxyz';
  const out = new Set();
  for (let i = 0; i <= w.length; i += 1) {
    const a = w.slice(0, i);
    const b = w.slice(i);
    if (b) out.add(a + b.slice(1));
    if (b.length > 1) out.add(a + b[1] + b[0] + b.slice(2));
    for (const c of L) {
      if (b) out.add(a + c + b.slice(1));
      out.add(a + c + b);
    }
  }
  return out;
}

/** "Tousism" -> "Tourism". Chỉ khi có MỘT ứng viên nổi trội (hơn ứng viên thứ hai >= 1 bậc Zipf). */
function bestSpell(w) {
  const lw = w.toLowerCase();
  const c = [...edits1(lw)].map((e) => [z(e), e]).filter(([s]) => s >= 3.0).sort((x, y) => y[0] - x[0]);
  if (!c.length) return null;
  if (c.length > 1 && c[0][0] - c[1][0] < 1.0) return 'AMBIG';
  let e = c[0][1];
  if (w[0] === w[0].toUpperCase()) e = e[0].toUpperCase() + e.slice(1);
  return e;
}

/** Sửa một chuỗi chữ thuần (không chứa dấu định dạng). */
export function fixText(s, ctx) {
  const log = (a, b, why) => ctx.fixes.push(`${ctx.where}: "${a}" → "${b}" (${why})`);
  // 1. dính sau dấu câu: "it.Great", "quit."The", "apple,and", "before 20.Around"
  const p1 = (m, a, b) => { log(m, `${a} ${b}`, 'thiếu dấu cách sau dấu câu'); return `${a} ${b}`; };
  s = s.replace(/(?<![A-Z.])([a-z]{2,}[.!?]["”’]?)(["“]?[A-Z][a-z]+)/g, p1);
  s = s.replace(/(?<![A-Z.])([a-z]{2,}[,;:])([a-z]{2,})/g, p1);
  s = s.replace(/(?<![\d.])(\d+[.!?])([A-Z][a-z]{2,})/g, p1);
  // 2. số dính chữ: "2refers", "44billion" (không tách 1st, 10km, 20th)
  s = s.replace(/\b(\d+)([A-Za-z]{3,})\b/g, (m, n, w) => {
    if (UNITS.has(w.toLowerCase()) || !isWord(w)) return m;
    log(m, `${n} ${w}`, 'số dính chữ');
    return `${n} ${w}`;
  });
  // 3. từng từ: tách từ dính / sửa chính tả
  s = s.replace(/(?<![\w’'-])[A-Za-z]+(?![\w’'-])/g, (w, offset, whole) => {
    const before = whole.slice(0, offset);
    const after = whole.slice(offset + w.length);
    if (/["“‘']\s*$/.test(before) && /^\s*["”’']/.test(after)) return w;   // từ đang được hỏi
    const midCap = w[0] !== w[0].toLowerCase() && /[a-z,;]\s+$/.test(before);
    if (midCap || [...w].filter((c) => c !== c.toLowerCase()).length >= 2) return w;
    // lỗi dính phổ biến đến mức có trong bảng tần suất ("ofthe" 3.3, "inthe" 2.6):
    // từ thông dụng chỉ tách khi CẢ HAI phần là hư từ; từ hiếm (< 2.5) tách khi có một phần là hư từ
    // và phần kia phổ biến hơn hẳn (không tách atone, inset, onset, await...)
    if (z(w) >= 1.0 && z(w) < 4.0 && w.length >= 4 && !FUNC.has(w.toLowerCase())) {
      const sp = bestSplit(w);
      if (sp && sp !== 'AMBIG') {
        const [a, b] = sp.toLowerCase().split(' ');
        const bothFunc = FUNC.has(a) && FUNC.has(b);
        const oneFunc = (FUNC.has(a) || FUNC.has(b)) && z(w) < 2.5
          && Math.min(FUNC.has(a) ? 7 : z(a), FUNC.has(b) ? 7 : z(b)) >= z(w) + 3.0;
        if (bothFunc || oneFunc) { log(w, sp, 'hai từ bị dính'); return sp; }
      }
    }
    if (z(w) >= 2.5 || FUNC.has(w.toLowerCase()) || w.length < 4) return w;
    if (z(w) >= 1.0) {
      // từ hiếm có trong từ điển: chỉ sửa khi có một từ gần giống phổ biến hơn hẳn
      const sc = bestSpell(w);
      if (sc && sc !== 'AMBIG' && z(sc) >= z(w) + 2.0 && (ctx.counts.get(w.toLowerCase()) || 0) < 2) {
        log(w, sc, 'sai chính tả, từ điển chỉ có 1 cách sửa');
        return sc;
      }
      return w;
    }
    const sp = bestSplit(w);
    if (sp && sp !== 'AMBIG') { log(w, sp, 'hai từ bị dính'); return sp; }
    if ((ctx.counts.get(w.toLowerCase()) || 0) >= 2) return w;   // lặp lại nhất quán: tên riêng / thuật ngữ
    const sc = bestSpell(w);
    if (sc && sc !== 'AMBIG') { log(w, sc, 'sai chính tả, từ điển chỉ có 1 cách sửa'); return sc; }
    ctx.warn.push(`${ctx.where}: từ lạ "${w}" không sửa được chắc chắn`);
    return w;
  });
  // 4. một từ bị tách đôi: "meaning ful" -> "meaningful"
  const toks = s.split(/(\s+)/);
  let i = 0;
  while (i + 2 < toks.length) {
    const a = toks[i];
    const b = toks[i + 2];
    const bw = b.replace(/[.,;:!?]+$/, '');
    if (toks[i + 1] === ' ' && /^[a-z]{2,}$/.test(a) && /^[a-z]{2,}$/.test(bw)
      && (!isWord(a) || !isWord(bw)) && z(a + bw) >= 3.0 && Math.min(z(a), z(bw)) < 3.0) {
      log(`${a} ${bw}`, a + bw, 'một từ bị tách đôi');
      toks.splice(i, 3, a + b);
      continue;
    }
    i += 2;
  }
  s = toks.join('');
  // 5. khoảng trắng thừa, dấu cách trước dấu câu
  const s2 = s.replace(/(?<=\S) {2,}(?=\S)/g, ' ').replace(/(?<=[A-Za-z]) +(?=[.,;:!?](\s|$))/g, '');
  if (s2 !== s) ctx.fixes.push(`${ctx.where}: bỏ khoảng trắng thừa`);
  return s2;
}

// Dấu định dạng dùng trong chữ đã lưu: [[gạch chân]] [b]đậm[/b] [i]nghiêng[/i] [mark]tô sáng[/mark]
const MARK_SPLIT = /(\[\[|\]\]|\[\/?(?:b|i|mark)\])/;

/** Sửa phần chữ ngoài dấu định dạng, giữ nguyên dấu. */
export function fixMarked(s, ctx) {
  return String(s || '').split(MARK_SPLIT).map((p) => (MARK_SPLIT.test(p) && /^(\[\[|\]\]|\[\/?(b|i|mark)\])$/.test(p) ? p : fixText(p, ctx))).join('');
}

export const stripMarks = (s) => String(s || '').replace(/\[\[|\]\]|\[\/?(?:b|i|mark)\]/g, '');

/** Áp dụng lên cả đề; trả { fixes, warnings } và sửa trực tiếp trên đối tượng đề. */
export function fixExam(exam) {
  const all = [];
  for (const sec of exam.sections) for (const g of sec.groups) for (const p of [...g.passage, ...g.intro]) all.push(p.marked || '');
  for (const sec of exam.sections) for (const p of sec.directions) all.push(p.marked || '');
  for (const q of exam.questions) all.push(q.question, ...q.options);
  const counts = new Map();
  for (const w of stripMarks(all.join(' ')).match(/[A-Za-z]+/g) || []) {
    const k = w.toLowerCase();
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const fixes = [];
  const warn = [];
  const fixPara = (p, where) => {
    const ctx = { counts, fixes, warn, where };
    p.marked = fixMarked(p.marked, ctx);
    p.text = stripMarks(p.marked);
  };
  for (const sec of exam.sections) {
    sec.directions.forEach((p, i) => fixPara(p, `${sec.title.slice(0, 16)} chỉ dẫn ${i + 1}`));
    for (const g of sec.groups) {
      g.passage.forEach((p, i) => fixPara(p, `${sec.title.slice(0, 16)} đoạn ${i + 1}`));
      g.intro.forEach((p, i) => fixPara(p, `${sec.title.slice(0, 16)} giới thiệu ${i + 1}`));
    }
  }
  for (const q of exam.questions) {
    q.question = fixMarked(q.question, { counts, fixes, warn, where: `Câu ${q.id}` });
    q.options = q.options.map((o, i) => fixMarked(o, { counts, fixes, warn, where: `Câu ${q.id} ${q.labels[i]}` }));
  }
  return { fixes, warnings: [...new Set(warn)].sort() };
}
