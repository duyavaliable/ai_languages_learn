/**
 * Sinh furigana (cách đọc hiragana) cho câu tiếng Nhật, kiểu giáo trình
 * Minna no Nihongo: CHỈ phần kanji có chữ nhỏ ở trên, okurigana để nguyên.
 *
 * Trả về mảng đoạn `{ text, ruby? }` nối lại đúng bằng câu gốc — trang chỉ cần
 * bọc đoạn có `ruby` bằng thẻ <ruby>. Không đổi chữ nào của câu, nên chỉ số
 * ký tự (dùng để tô từ bị gắn cờ) vẫn khớp với câu trong CSDL.
 */

import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const kuromoji = require('kuromoji');

const DIC_PATH = path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict');

const KANJI_RE = /[㐀-鿿豈-﫿々〆ヶ]/;

let tokenizerPromise = null;

/** Nạp từ điển một lần (~1–2 giây), các lần sau dùng lại. */
function getTokenizer() {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath: DIC_PATH }).build((err, tokenizer) => {
        if (err) {
          tokenizerPromise = null;
          reject(err);
        } else {
          resolve(tokenizer);
        }
      });
    });
  }
  return tokenizerPromise;
}

function toHiragana(s) {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Chia một từ thành đoạn kanji / kana rồi khớp với cách đọc, để furigana chỉ
 * nằm trên kanji: 引っ越し + ひっこし -> 引(ひ) っ 越(こ) し.
 * Không khớp được (cách đọc bất quy tắc) thì đặt cả cách đọc lên cả từ.
 */
function splitWord(surface, reading) {
  const runs = [];
  for (const ch of surface) {
    const isKanji = KANJI_RE.test(ch);
    const last = runs[runs.length - 1];
    if (last && last.kanji === isKanji) last.text += ch;
    else runs.push({ text: ch, kanji: isKanji });
  }
  const pattern = runs
    .map((r) => (r.kanji ? '(.+?)' : `(${escapeRe(toHiragana(r.text))})`))
    .join('');
  const m = new RegExp(`^${pattern}$`).exec(reading);
  if (!m) return [{ text: surface, ruby: reading }];
  return runs.map((r, i) => (r.kanji ? { text: r.text, ruby: m[i + 1] } : { text: r.text }));
}

/** Gộp các đoạn không có ruby đứng liền nhau cho gọn. */
function merge(segments) {
  const out = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if (!s.ruby && last && !last.ruby) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

export async function furiganaSegments(text) {
  const str = String(text || '');
  if (!KANJI_RE.test(str)) return [{ text: str }];
  const tokenizer = await getTokenizer();
  const segments = [];
  for (const t of tokenizer.tokenize(str)) {
    const surface = t.surface_form;
    const reading = t.reading && t.reading !== '*' ? toHiragana(t.reading) : '';
    if (!KANJI_RE.test(surface) || !reading) segments.push({ text: surface });
    else segments.push(...splitWord(surface, reading));
  }
  return merge(segments);
}

export async function furiganaBatch(texts) {
  return Promise.all((texts || []).map((t) => furiganaSegments(t)));
}
