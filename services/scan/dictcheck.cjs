// Đọc JSON mảng chuỗi từ stdin. Với mỗi chuỗi, tìm chỗ NGHI OCR ĐỌC NHẦM bằng từ điển kuromoji.
// Trả về [{run, variant, word, kind}] cho từng chuỗi. Ba loại:
//  - voice  : cụm hiragana, đổi dấu ゛゜ một chữ thì các mảnh vụn thành một từ (えんびつ -> えんぴつ)
//  - kvoice : cụm katakana không có trong từ điển, đổi dấu ゛゜ thì thành một từ (デバート -> デパート)
//  - kanji  : kanji đứng lẻ trước okurigana, thay bằng chữ TRÔNG GIỐNG thì thành động/tính từ
//             (昔きました -> 書きました). Bảng chữ giống nhau LOOKALIKE mở rộng dần từ các lần admin sửa.
const path = require('path');
const fs = require('fs');
const kuromoji = require('kuromoji');
const ROOT = path.dirname(require.resolve('kuromoji/package.json'));

// dấu ゛゜ và chữ nhỏ/chữ to (OCR hay đọc ゃ thành や: じてんしゃ -> じてんしや)
const ROWS = ['かがか', 'きぎき', 'くぐく', 'けげけ', 'こごこ', 'さざさ', 'しじし', 'すずす', 'せぜせ', 'そぞそ',
  'ただた', 'ちぢち', 'つづつ', 'てでて', 'とどと', 'はばぱ', 'ひびぴ', 'ふぶぷ', 'へべぺ', 'ほぼぽ',
  'やゃ', 'ゆゅ', 'よょ', 'つっ', 'あぁ', 'いぃ', 'うぅ', 'えぇ', 'おぉ'];
const KROWS = ROWS.map((r) => [...r].map((c) => String.fromCharCode(c.charCodeAt(0) + 0x60)).join(''));
const variantsOf = (ch, rows) => [...new Set(rows.filter((x) => x.includes(ch)).join(''))].filter((c) => c !== ch);

// nhóm kanji OCR hay nhầm với nhau (nét gần giống). File lookalike.json (nếu có) bổ sung thêm.
let LOOKALIKE = ['書昔', '土士十', '末未', '日目曰', '人入八', '千干', '力刀', '己已巳', '待持侍', '問間',
  '休体', '大犬太', '午牛', '天夫', '白百自', '本木', '使便', '読続', '話語', '言信', '来米', '買貝', '見貝',
  '長帳', '思恩', '住往', '作昨', '教数', '借惜', '始治', '終絡', '会合', '飲飯'];
try { LOOKALIKE = LOOKALIKE.concat(JSON.parse(fs.readFileSync(path.join(__dirname, 'lookalike.json'), 'utf8'))); } catch (e) { /* chưa có */ }
const lookOf = (ch) => [...new Set(LOOKALIKE.filter((g) => g.includes(ch)).join(''))].filter((c) => c !== ch);

function voiceHira(tk, t, found) {
  for (const m of t.matchAll(/[\u3041-\u3096]{3,}/g)) {
    const run = m[0];
    const toks = tk.tokenize(run);
    if (!toks.some((w) => w.surface_form.length === 1 && w.pos !== '助詞')) continue;
    for (let i = 0; i < run.length; i++) {
      for (const v of variantsOf(run[i], ROWS)) {
        const alt = run.slice(0, i) + v + run.slice(i + 1);
        const at = tk.tokenize(alt);
        const big = at.find((w) => w.word_type === 'KNOWN' && w.surface_form.length >= 3
          && (w.pos === '名詞' || w.pos === '動詞' || w.pos === '形容詞') && w.surface_form.includes(v));
        if (big && at.length < toks.length) {
          let p = 0, s0 = -1;
          for (const w of at) { if (w === big) { s0 = p; break; } p += w.surface_form.length; }
          const e0 = s0 + big.surface_form.length;
          let covered = 0; p = 0;
          for (const w of toks) { const a = p, b = p + w.surface_form.length; if (a >= s0 && b <= e0) covered++; p = b; }
          if (s0 <= i && i < e0 && covered >= 2) found.push({ run, variant: alt, word: big.surface_form, kind: 'voice' });
        }
      }
    }
  }
}

function voiceKata(tk, t, found) {
  for (const m of t.matchAll(/[\u30A1-\u30FA\u30FC]{3,}/g)) {
    const run = m[0];
    const toks = tk.tokenize(run);
    if (toks.length === 1 && toks[0].word_type === 'KNOWN') continue;   // đã là một từ có thật
    for (let i = 0; i < run.length; i++) {
      for (const v of variantsOf(run[i], KROWS)) {
        const alt = run.slice(0, i) + v + run.slice(i + 1);
        const at = tk.tokenize(alt);
        if (at.length === 1 && at[0].word_type === 'KNOWN' && at[0].pos === '名詞') {
          found.push({ run, variant: alt, word: alt, kind: 'kvoice' });
        }
      }
    }
  }
}

function lookKanji(tk, t, found) {
  const toks = tk.tokenize(t);
  let p = 0;
  for (let k = 0; k < toks.length; k++) {
    const w = toks[k]; const s = p; p += w.surface_form.length;
    // kanji đứng thành token riêng, ngay sau là hiragana
    if (w.surface_form.length !== 1 || !/[\u4E00-\u9FFF]/.test(w.surface_form)) continue;
    const kana = (t.slice(p).match(/^[\u3041-\u3096]{1,4}/) || [''])[0];
    if (!kana) continue;
    for (const v of lookOf(w.surface_form)) {
      const alt = t.slice(0, s) + v + t.slice(p);
      const at = tk.tokenize(alt);
      let q = 0;
      const hit = at.find((x) => { const a = q; q += x.surface_form.length; return a === s; });
      if (hit && hit.word_type === 'KNOWN' && (hit.pos === '動詞' || hit.pos === '形容詞')
          && hit.surface_form.length >= 2 && hit.surface_form[0] === v) {
        found.push({ run: w.surface_form + kana, variant: v + kana, word: hit.basic_form, kind: 'kanji' });
      }
    }
  }
}

let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  const texts = JSON.parse(input);
  kuromoji.builder({ dicPath: path.join(ROOT, 'dict') }).build((err, tk) => {
    if (err) { console.error(err); process.exit(1); }
    const out = texts.map((t) => {
      const found = [];
      if (t) { voiceHira(tk, t, found); voiceKata(tk, t, found); lookKanji(tk, t, found); }
      return found;
    });
    process.stdout.write(JSON.stringify(out));
  });
});
