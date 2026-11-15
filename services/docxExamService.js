// Đọc đề thi trắc nghiệm dạng Word (.docx): Đọc / Nghe tiếng Anh (VSTEP, B1...).
//
// File Word đã có sẵn chữ chính xác nên KHÔNG OCR. Bộ đọc chỉ nhận dạng cấu trúc:
// phần (PART / PASSAGE) -> nhóm câu (Questions 9 to 12) -> đoạn văn / mô tả -> câu hỏi -> phương án
// -> bảng đáp án (+ độ khó nếu có). Giữ định dạng có ý nghĩa với câu hỏi:
//   [[gạch chân]]  [b]in đậm[/b]  [i]in nghiêng[/i]  [mark]tô sáng[/mark]
// (câu hỏi "highlighted statement" cần phần tô sáng, câu hỏi từ vựng cần từ in đậm).
// Lỗi gõ nằm sẵn trong file được tự sửa khi chắc chắn (englishTextFix.js); chỗ không chắc
// và lỗi cấu trúc được trả về `warnings` để admin duyệt.
import PizZip from 'pizzip';
import { fixExam, stripMarks } from './englishTextFix.js';

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&');

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
};
const flagOn = (tag) => {
  const v = attr(tag, 'w:val');
  return v === null || !['0', 'false', 'none'].includes(v);
};

/**
 * document.xml -> danh sách khối theo thứ tự: { runs: [[text, fmt]] } cho đoạn văn,
 * { table: [[cellText]] } cho bảng. fmt = { b, i, u, hl }.
 */
function readBlocks(xml) {
  const blocks = [];
  const re = /<(\/?)(w:[A-Za-z]+)([^>]*?)(\/?)>|([^<]+)/g;
  let tblDepth = 0;
  let table = null; let row = null; let cell = null;
  let para = null;           // runs của đoạn văn đang đọc
  let inRun = false; let inRPr = false; let inText = false; let inDel = 0;
  let fmt = null;
  let m;
  while ((m = re.exec(xml))) {
    const [, close, name, rest, self, text] = m;
    if (text !== undefined) {
      if (inText && para && !inDel) para.push([decode(text), { ...fmt }]);
      continue;
    }
    if (name === 'w:del') { inDel += close ? -1 : (self ? 0 : 1); continue; }
    if (name === 'w:tbl') {
      if (!close) { tblDepth += 1; if (tblDepth === 1) table = []; } else {
        tblDepth -= 1;
        if (tblDepth === 0) { blocks.push({ table }); table = null; }
      }
      continue;
    }
    if (tblDepth === 1 && name === 'w:tr') { if (!close) row = []; else { table.push(row); row = null; } continue; }
    if (tblDepth === 1 && name === 'w:tc') { if (!close) cell = []; else { row.push(cell.join(' ').trim()); cell = null; } continue; }
    if (name === 'w:p') {
      if (self) { if (tblDepth === 0) blocks.push({ runs: [] }); continue; }
      if (!close) { para = []; continue; }
      if (tblDepth === 0) blocks.push({ runs: para });
      else if (cell) cell.push(para.map(([t]) => t).join(''));
      para = null;
      continue;
    }
    if (name === 'w:r') { if (!close && !self) { inRun = true; fmt = { b: false, i: false, u: false, hl: false }; } else if (close) inRun = false; continue; }
    if (name === 'w:rPr') { if (inRun) inRPr = !close && !self; continue; }
    if (inRPr && !close) {
      if (name === 'w:b') fmt.b = flagOn(rest);
      else if (name === 'w:i') fmt.i = flagOn(rest);
      else if (name === 'w:u') fmt.u = flagOn(rest);
      else if (name === 'w:highlight') fmt.hl = flagOn(rest);
      continue;
    }
    if (!inRun || !para || inDel) continue;
    if (name === 'w:t') { inText = !close && !self; continue; }
    if (close) continue;
    if (name === 'w:tab') para.push(['\t', { ...fmt }]);
    else if (name === 'w:br' || name === 'w:cr') para.push(['\n', { ...fmt }]);
    else if (name === 'w:drawing' || name === 'w:pict') para.push(['￼', { ...fmt }]);
  }
  return blocks;
}

const txt = (runs) => runs.map(([t]) => t).join('');

/** Bỏ n ký tự đầu và khoảng trắng hai đầu, giữ định dạng từng mảnh. */
function stripRuns(runs, n) {
  let k = n;
  const out = [];
  for (const [t, f] of runs) {
    if (k >= t.length) { k -= t.length; continue; }
    out.push([t.slice(k), f]); k = 0;
  }
  while (out.length && !out[0][0].trim()) out.shift();
  if (out.length) out[0] = [out[0][0].replace(/^\s+/, ''), out[0][1]];
  while (out.length && !out[out.length - 1][0].trim()) out.pop();
  if (out.length) out[out.length - 1] = [out[out.length - 1][0].replace(/\s+$/, ''), out[out.length - 1][1]];
  return out;
}

/** Tách runs tại các vị trí khớp `sep` trên chuỗi ghép. */
function splitRuns(runs, sep) {
  const text = txt(runs);
  const cuts = [...text.matchAll(sep)].map((mm) => mm.index).filter((i) => i > 0);
  if (!cuts.length) return [runs];
  const bounds = [0, ...cuts, text.length];
  const pieces = [];
  for (let j = 0; j + 1 < bounds.length; j += 1) {
    const a = bounds[j]; const b = bounds[j + 1];
    const seg = []; let pos = 0;
    for (const [t, f] of runs) {
      const lo = Math.max(a, pos); const hi = Math.min(b, pos + t.length);
      if (lo < hi) seg.push([t.slice(lo - pos, hi - pos), f]);
      pos += t.length;
    }
    pieces.push(seg);
  }
  return pieces;
}

/** runs -> chữ có dấu định dạng. Không thêm bớt ký tự nào ngoài dấu. */
function toMarked(runs) {
  let s = '';
  for (const [t, f] of runs) {
    if (!t.trim()) { s += t; continue; }
    // dấu định dạng bọc phần chữ, khoảng trắng hai đầu để ngoài
    const lead = t.match(/^\s*/)[0]; const trail = t.match(/\s*$/)[0];
    let x = t.trim();
    if (f.u) x = `[[${x}]]`;
    if (f.i) x = `[i]${x}[/i]`;
    if (f.b) x = `[b]${x}[/b]`;
    if (f.hl) x = `[mark]${x}[/mark]`;
    s += lead + x + trail;
  }
  // gộp dấu liền nhau: "[b]a[/b] [b]b[/b]" -> "[b]a b[/b]"
  let prev;
  do {
    prev = s;
    s = s.replace(/\[\/(b|i|mark)\](\s*)\[\1\]/g, '$2').replace(/\]\](\s*)\[\[/g, '$1');
  } while (s !== prev);
  return s;
}

const plain = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

const SEC_RE = /^\s*(PART\s+\d+|PASSAGE\s+\d+|SECTION\s+\d+)\b.*?(\d+)\s*[-–]\s*(\d+)/i;
const SUB_RE = /^\s*Questions?\s+(\d+)\s*(?:[-–]|to)\s*(\d+)/i;
const Q_RE = /^\s*(\d{1,2})(?:\s*[.)]\s*|\s+)(?=\S)/;
const OPT_RE = /^\s*([A-D])\s*[.)]\s*/;
const OPT_SPLIT = /(?:(?<=\n)|(?<=\t)|(?<=\s{2}))\s*(?=[A-D]\s*[.)]\s*\S)/g;
// Tiêu đề phần đáp án — tiếng Việt hoặc tiếng Anh, hoa / thường: "ĐÁP ÁN", "Đáp án và giải thích", "ANSWER KEY",
// "Answers", "Key", "KEYS", "Key to the test", "Suggested answers", "Answer sheet". Sau tiêu đề chỉ được là hết dòng,
// dấu ":" / "." / "-" hoặc đáp án viết luôn ("KEY 1.B 2.C"): "Answer the questions below" KHÔNG phải tiêu đề.
const KEY_RE = /^\s*(?:(?:SUGGESTED\s+)?ANSWERS?(?:\s*(?:KEYS?|SHEET))?|KEYS?(?:\s+TO\s+(?:THE\s+)?(?:TEST|EXAM|QUESTIONS?))?|(?:GOI\s*Y\s*)?DAP\s*AN(?:\s+\S.*)?)\s*(?:[:.\-–]|$|(?=\s*\d))/i;
const LEVEL_RE = /^\s*(DO\s*KHO|LEVEL|DIFFICULTY)\b/i;
const INTRO_RE = /^\s*(Directions?|Now,|On the (recording|test book)|The correct answer)/i;

// ----- ĐỌC BẢNG / DANH SÁCH ĐÁP ÁN -----
// Gặp nhiều kiểu trình bày; đọc được hết các kiểu sau (số câu + chữ A–D):
//   bảng ô xen kẽ     | 1 | C | 6 | A | 11 | B |        (VSTEP READING 9)
//   bảng theo cột     | 1 | 2 | 3 |  rồi hàng dưới  | B | C | A |
//   ô gộp             | 1.B | 2-C | 3) A | 4B |
//   bảng chỉ có chữ   | B | C | A | D |                 (đọc theo hàng, trái sang phải = câu 1, 2, 3…)
//   dòng chữ          "1. B   2. C", "1-B; 2-C", "Question 1: B", "1) B"
const KEY_NUM = /^\d{1,3}$/;
const KEY_LET = /^[A-Da-d]$/;
const KEY_CELL = /^(\d{1,3})\s*[.):\-–]?\s*([A-Da-d])\.?$/;
// trong dòng chữ chỉ nhận chữ IN HOA (tránh "2 a lot" trong lời giải thích)
const KEY_TEXT = /(?:^|[\s,;|\t(])(?:Question\s*|Câu\s*)?(\d{1,3})\s*[.):\-–]?\s*([A-D])(?=$|[\s,;|.)\t])/gi;

function addKey(keys, n, a) {
  keys.set(n, [...(keys.get(n) || []), a.toUpperCase()]);
}

/** Một bảng đáp án -> keys. Trả về true nếu đọc được ít nhất một đáp án. */
function keysFromTable(table, keys) {
  const rows = table.map((r) => r.map((c) => String(c || '').trim()).filter((c) => c !== ''));
  let found = 0;
  const used = new Set();
  // bảng theo cột: hàng toàn số câu + hàng ngay dưới toàn chữ cái, cùng số ô
  for (let i = 0; i + 1 < rows.length; i += 1) {
    const a = rows[i]; const b = rows[i + 1];
    if (a.length && a.length === b.length && a.every((c) => KEY_NUM.test(c)) && b.every((c) => KEY_LET.test(c))) {
      a.forEach((c, k) => addKey(keys, Number(c), b[k]));
      used.add(i); used.add(i + 1); found += a.length; i += 1;
    }
  }
  rows.forEach((r, i) => {
    if (used.has(i)) return;
    for (let k = 0; k < r.length; k += 1) {
      const cm = r[k].match(KEY_CELL);
      if (cm) { addKey(keys, Number(cm[1]), cm[2]); found += 1; continue; }
      if (KEY_NUM.test(r[k]) && k + 1 < r.length && KEY_LET.test(r[k + 1])) {
        addKey(keys, Number(r[k]), r[k + 1]); found += 1; k += 1; continue;
      }
      // ô chứa cả dãy "1.B 2.C"
      for (const mm of r[k].matchAll(KEY_TEXT)) { addKey(keys, Number(mm[1]), mm[2]); found += 1; }
    }
  });
  return found > 0;
}

/** Danh sách khối (đoạn văn / bảng) ĐÃ NẰM TRONG phần đáp án -> keys; bảng chỉ có chữ cái để cuối cùng. */
function keysFromBlocks(blocks, keys, notes) {
  const letterOnly = [];
  for (const blk of blocks) {
    if (blk.table) {
      if (!keysFromTable(blk.table, keys)) {
        const cells = blk.table.flat().map((c) => String(c || '').trim()).filter(Boolean);
        if (cells.length && cells.every((c) => KEY_LET.test(c))) letterOnly.push(...cells);
      }
      continue;
    }
    const t = txt(blk.runs || []);
    for (const mm of t.matchAll(KEY_TEXT)) addKey(keys, Number(mm[1]), mm[2]);
  }
  if (!keys.size && letterOnly.length) {
    letterOnly.forEach((c, i) => addKey(keys, i + 1, c));
    notes.push(`Bảng đáp án không ghi số câu: đọc theo hàng, trái sang phải (${letterOnly.length} ô = ${letterOnly.length} câu)`);
  }
}

/** Chữ của file PDF có lớp chữ, theo từng dòng (dùng cho file đáp án riêng dạng PDF). */
async function pdfTextLines(buffer) {
  const { default: PDFParser } = await import('pdf2json');
  const data = await new Promise((resolve, reject) => {
    const p = new PDFParser(null, 1);
    p.on('pdfParser_dataError', (e) => reject(e?.parserError || e));
    p.on('pdfParser_dataReady', resolve);
    p.parseBuffer(buffer);
  });
  const lines = [];
  for (const page of data?.Pages || []) {
    const byY = new Map();
    for (const t of page.Texts || []) {
      const y = Math.round(t.y * 2) / 2;
      let s = ''; try { s = decodeURIComponent(t.R?.[0]?.T || ''); } catch { s = t.R?.[0]?.T || ''; }
      byY.set(y, [...(byY.get(y) || []), [t.x, s]]);
    }
    [...byY.keys()].sort((a, b) => a - b).forEach((y) => {
      lines.push(byY.get(y).sort((a, b) => a[0] - b[0]).map(([, s]) => s).join('  '));
    });
  }
  return lines;
}

/**
 * File đáp án RIÊNG (.docx / .txt / .pdf có lớp chữ) -> danh sách khối. Có tiêu đề đáp án ("Key", "Đáp án"…)
 * thì chỉ lấy phần sau tiêu đề; không có thì cả file là đáp án.
 */
export async function keyBlocksFromFile(file) {
  const name = String(file?.originalname || '').toLowerCase();
  let blocks;
  if (name.endsWith('.docx')) {
    const zip = new PizZip(file.buffer);
    const doc = zip.file('word/document.xml');
    if (!doc) throw new Error('File đáp án không phải tài liệu Word hợp lệ.');
    blocks = readBlocks(doc.asText());
  } else if (name.endsWith('.txt')) {
    blocks = file.buffer.toString('utf8').split(/\r?\n/).map((l) => ({ runs: [[l, {}]] }));
  } else if (name.endsWith('.pdf')) {
    const lines = await pdfTextLines(file.buffer);
    if (!lines.join('').trim()) throw new Error('File đáp án PDF không có lớp chữ (PDF chụp ảnh) — hãy dùng file .docx/.txt, hoặc chọn đáp án tay ở bước duyệt.');
    blocks = lines.map((l) => ({ runs: [[l, {}]] }));
  } else {
    throw new Error('File đáp án phải là .docx, .txt hoặc .pdf có lớp chữ.');
  }
  const at = blocks.findIndex((b) => !b.table && KEY_RE.test(plain(txt(b.runs || []).trim())));
  if (at < 0) return blocks;
  // đáp án viết ngay trên dòng tiêu đề ("KEY: 1.B 2.C") vẫn được đọc
  return blocks.slice(at);
}

export function parseDocxExam(buffer, { keyBlocks = null } = {}) {
  const zip = new PizZip(buffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('File không phải tài liệu Word hợp lệ (thiếu word/document.xml).');
  const blocks = readBlocks(docFile.asText());

  const title = [];
  const sections = [];
  const questions = [];
  const warnings = [];
  const fixes = [];
  let curSec = null; let curGrp = null;
  let expect = 1;
  let pend = [];
  let lastQ = null;
  let mode = null;
  const keys = new Map(); const levels = new Map();
  const keyPart = [];        // các khối nằm trong phần đáp án của chính file đề
  let images = 0;

  const newGroup = (head, a, b) => {
    curGrp = { title: head, range: [a, b], intro: [], passage: [] };
    curSec.groups.push(curGrp);
  };
  const addOption = (q, pieceRuns) => {
    const om = txt(pieceRuns).match(OPT_RE);
    if (!om) return false;
    const o = stripRuns(pieceRuns, om[0].length);
    q.labels.push(om[1]); q.options.push(toMarked(o));
    return true;
  };

  for (let blk of blocks) {
    if (blk.table) {
      const cells = blk.table.flat();
      if (mode === 'key') { keyPart.push(blk); continue; }
      if (cells.length === 1 && SEC_RE.test(cells[0])) {
        blk = { runs: [[cells[0], { b: true, i: false, u: false, hl: false }]] };
      } else {
        warnings.push(`Bảng không nhận dạng được: ${cells.join(' | ').slice(0, 80)}`);
        continue;
      }
    }
    const { runs } = blk;
    const t = txt(runs).trim();
    if (!t) continue;
    if (t.includes('￼')) images += 1;
    const pt = plain(t);
    // tiêu đề phần đáp án: chỉ nhận khi KHÔNG phải số câu / phương án ("1. Answer ..." là câu hỏi)
    if (KEY_RE.test(pt) && !Q_RE.test(t) && !OPT_RE.test(t)) { mode = 'key'; keyPart.push(blk); continue; }
    if (LEVEL_RE.test(pt)) { mode = 'level'; continue; }
    if (mode === 'key') { keyPart.push(blk); continue; }
    if (mode === 'level') {
      for (const mm of t.matchAll(/(\d{1,2})\s*[.)]?\s*\(\s*(\d)\s*\)/g)) levels.set(Number(mm[1]), Number(mm[2]));
      continue;
    }
    let m = t.match(SEC_RE);
    if (m && !Q_RE.test(t)) {
      curSec = { title: t, range: [Number(m[2]), Number(m[3])], directions: [], groups: [] };
      sections.push(curSec);
      newGroup(null, Number(m[2]), Number(m[3]));
      pend = []; lastQ = null;
      continue;
    }
    if (!curSec) { title.push(t); continue; }
    m = t.match(SUB_RE);
    if (m && !Q_RE.test(t)) {
      newGroup(t, Number(m[1]), Number(m[2]));
      pend = []; lastQ = null;
      continue;
    }
    const qm = t.match(Q_RE);
    if (qm && Number(qm[1]) === expect) {
      const body = stripRuns(runs, txt(runs).match(Q_RE)[0].length);
      const parts = splitRuns(body, OPT_SPLIT);
      const stem = stripRuns(parts[0], 0);
      const q = {
        id: expect, sectionTitle: curSec.title, group: curGrp,
        question: toMarked(stem), options: [], labels: []
      };
      for (const pp of parts.slice(1)) addOption(q, pp);
      // đoạn văn / mô tả nằm giữa tiêu đề nhóm và câu đầu tiên; phần ví dụ mẫu -> giới thiệu
      const example = pend.some((p) => INTRO_RE.test(p.text));
      for (const p of pend) (example || INTRO_RE.test(p.text) ? curGrp.intro : curGrp.passage).push(p);
      pend = [];
      questions.push(q); lastQ = q; expect += 1;
      continue;
    }
    if (qm && lastQ && !OPT_RE.test(t) && /^\s*\d{1,2}\s*[.)]\s+[A-Z]/.test(t)) {
      warnings.push(`Số câu "${t.slice(0, 30)}" không đúng thứ tự (đang chờ câu ${expect})`);
    }
    // phương án (nhiều phương án trên một dòng, cách nhau bằng tab / ngắt dòng)
    if (lastQ && OPT_RE.test(t)) {
      for (const pp of splitRuns(runs, OPT_SPLIT)) {
        if (addOption(lastQ, pp)) continue;
        const s = txt(pp).trim();
        if (s && lastQ.options.length) lastQ.options[lastQ.options.length - 1] += ` ${toMarked(stripRuns(pp, 0))}`;
      }
      continue;
    }
    // dòng nối tiếp của phương án bị xuống dòng (bắt đầu bằng chữ thường)
    if (lastQ && lastQ.options.length && !pend.length && t.length < 80 && /^[a-z]/.test(t)
      && !/^\s*(Questions?|Conversation|Directions|End of)/i.test(t)) {
      lastQ.options[lastQ.options.length - 1] += ` ${toMarked(stripRuns(runs, 0))}`;
      continue;
    }
    if (/^\s*End of the test/i.test(t)) continue;
    const para = { text: t, marked: toMarked(stripRuns(runs, 0)) };
    if (!lastQ && !curGrp.passage.length && !pend.length && /^\s*Directions?\b/i.test(t)) {
      curSec.directions.push(para);
      continue;
    }
    pend.push(para);
    if (lastQ) lastQ = null;
  }

  // ----- kiểm tra + tự sửa cấu trúc -----
  const n = questions.length;
  if (!n) throw new Error('Không tìm thấy câu hỏi trắc nghiệm nào (dạng "1. ..." với phương án A. B. C. D.).');
  for (const q of questions) {
    const want = 'ABCD'.slice(0, q.labels.length).split('');
    if (q.labels.length < 2 || q.labels.join('') !== want.join('')) {
      warnings.push(`Câu ${q.id}: phương án ${q.labels.join('') || '(không có)'} không đủ / không đúng thứ tự`);
    }
    if (q.options.some((o) => !stripMarks(o).trim())) warnings.push(`Câu ${q.id}: có phương án rỗng`);
  }
  for (const s of sections) {
    const ids = questions.filter((q) => q.sectionTitle === s.title).map((q) => q.id);
    const [a, b] = s.range;
    if (ids.length && (ids[0] !== a || ids[ids.length - 1] !== b)) {
      warnings.push(`${s.title}: tiêu đề ghi câu ${a}-${b} nhưng đọc được câu ${ids[0]}-${ids[ids.length - 1]}`);
    }
    // số câu trong tiêu đề nhóm phải khớp câu thực sự nằm dưới nó (vd "21-26" rồi "26-30"):
    // thứ tự câu trong file là chắc chắn nên sửa tiêu đề theo câu thực tế
    for (const g of s.groups) {
      if (!g.title) continue;
      const gi = questions.filter((q) => q.group === g).map((q) => q.id);
      if (gi.length && (gi[0] !== g.range[0] || gi[gi.length - 1] !== g.range[1])) {
        const sm = g.title.match(SUB_RE);
        const old = g.title;
        const i1 = old.indexOf(sm[1]); const i2 = old.indexOf(sm[2], i1 + sm[1].length);
        g.title = old.slice(0, i1) + gi[0] + old.slice(i1 + sm[1].length, i2) + gi[gi.length - 1] + old.slice(i2 + sm[2].length);
        fixes.push(`Tiêu đề nhóm "${old.split(':')[0]}" ghi câu ${g.range[0]}-${g.range[1]} nhưng thực tế là câu ${gi[0]}-${gi[gi.length - 1]} → đã sửa`);
        g.range = [gi[0], gi[gi.length - 1]];
      }
    }
  }
  // Đáp án: file đáp án RIÊNG (admin tải kèm) được ưu tiên; không có thì dùng phần đáp án cuối file đề.
  let keySource = null;
  if (keyBlocks) {
    keysFromBlocks(keyBlocks, keys, fixes);
    keySource = 'file đáp án riêng';
    if (!keys.size) warnings.push('File đáp án riêng không đọc được đáp án nào (cần dạng "1. B", bảng số câu + đáp án, …)');
  }
  if (!keys.size && keyPart.length) {
    keysFromBlocks(keyPart, keys, fixes);
    keySource = 'phần đáp án cuối file đề';
  }
  const keyIds = [...keys.keys()].sort((a, b) => a - b);
  const dupIds = keyIds.filter((k) => keys.get(k).length > 1 && new Set(keys.get(k)).size > 1);
  const missIds = questions.map((q) => q.id).filter((id) => !keys.has(id));
  const extraIds = keyIds.filter((k) => !questions.some((q) => q.id === k));
  const keyOk = keys.size > 0 && !dupIds.length && !missIds.length && !extraIds.length;
  if (keys.size && !keyOk) {
    const why = [
      missIds.length && `thiếu đáp án câu ${missIds.join(', ')}`,
      extraIds.length && `có đáp án cho câu không có trong đề: ${extraIds.join(', ')}`,
      dupIds.length && `câu có hai đáp án khác nhau: ${dupIds.join(', ')}`
    ].filter(Boolean).join('; ');
    warnings.push(`Đáp án (${keySource}) không khớp đề: ${why} — chưa gắn đáp án, admin chọn tay hoặc sửa file đáp án`);
  }
  if (keyOk) fixes.push(`Đã gắn đáp án ${n} câu từ ${keySource}`);
  if (!keys.size) warnings.push('Không thấy đáp án (trong file đề không có phần "Đáp án / Answer key / Key", cũng chưa gắn file đáp án riêng) — admin chọn đáp án cho từng câu hoặc gắn file đáp án');
  for (const q of questions) {
    if (keyOk) {
      const a = keys.get(q.id)[0];   // cùng một đáp án ghi hai lần (bảng + dòng chữ) vẫn hợp lệ
      if (q.labels.includes(a)) q.answer = a;
      else warnings.push(`Câu ${q.id}: đáp án ${a} không có trong phương án`);
    }
    if (levels.has(q.id)) q.level = levels.get(q.id);
  }
  if (images) warnings.push(`Đề có ${images} hình ảnh nhúng trong file Word — bộ đọc chưa lấy ảnh, admin kiểm tra lại câu có hình`);

  const exam = { title, sections, questions };
  const tf = fixExam(exam);
  fixes.push(...tf.fixes);
  warnings.push(...tf.warnings);

  // thời gian làm bài ghi trong đề ("Time permitted: 60 minutes")
  const tm = title.join(' ').match(/(\d{1,3})\s*minutes?/i);
  return toExercisePayload(exam, { fixes, warnings, answersAttached: keyOk, timeLimitSec: tm ? Number(tm[1]) * 60 : null });
}

/** Đổi sang cấu trúc câu hỏi của trang làm bài: mỗi câu mang `section` + `passage` của nhóm. */
function toExercisePayload(exam, meta) {
  const groupText = new Map();
  for (const s of exam.sections) {
    let first = true;
    for (const g of s.groups) {
      const qs = exam.questions.filter((q) => q.group === g);
      const parts = [];
      if (first && qs.length) parts.push(...s.directions.map((p) => p.marked));
      if (g.title) parts.push(`[b]${g.title}[/b]`);
      parts.push(...g.intro.map((p) => p.marked), ...g.passage.map((p) => p.marked));
      if (qs.length) first = false;
      groupText.set(g, parts.filter(Boolean).join('\n\n'));
    }
  }
  const questions = exam.questions.map((q) => ({
    id: q.id,
    section: q.sectionTitle,
    passage: groupText.get(q.group) || '',
    question: q.question,
    options: q.options,
    labels: q.labels,
    correctAnswer: q.answer || '',
    ...(q.level ? { level: q.level } : {})
  }));
  return {
    header: exam.title,
    questions,
    fixes: meta.fixes,
    warnings: meta.warnings,
    answersAttached: meta.answersAttached,
    timeLimitSec: meta.timeLimitSec,
    stats: { questions: questions.length, sections: exam.sections.length }
  };
}
