// Đọc JSON [[kanji, furigana], ...] từ stdin. Với mỗi cặp: cách đọc của cụm kanji theo từ điển kuromoji
// có TRÙNG furigana OCR đọc được không. Trả về [true/false/null] (null = từ điển không có cách đọc).
// Furigana chữ rất nhỏ: OCR hay đọc nhầm chữ nhỏ/chữ to (げつよう -> げっよう) và dấu ゛゜.
const path = require('path');
const kuromoji = require('kuromoji');
const DIC = path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict');
const hira = (s) => s.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
let buf = '';
process.stdin.on('data', (d) => { buf += d; });
process.stdin.on('end', () => {
  const pairs = JSON.parse(buf);
  kuromoji.builder({ dicPath: DIC }).build((err, tk) => {
    if (err) { process.stdout.write(JSON.stringify(pairs.map(() => null))); return; }
    const out = pairs.map(([base, ruby]) => {
      const toks = tk.tokenize(base);
      if (toks.some((t) => !t.reading || t.reading === '*')) return null;
      return hira(toks.map((t) => t.reading).join('')) === hira(ruby);
    });
    process.stdout.write(JSON.stringify(out));
  });
});
