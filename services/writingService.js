/**
 * Chấm bài viết tiếng Anh ở mức CƠ BẢN, KHÔNG dùng model AI.
 *
 * Hai nguồn, đều tất định (cùng bài -> cùng kết quả):
 *   1. LanguageTool — bộ LUẬT ngữ pháp/chính tả/dấu câu viết tay, chạy cục bộ
 *      ở cổng 8081 cùng `npm run dev` (scripts/languagetool.mjs). Bài viết
 *      không gửi ra ngoài máy.
 *   2. Các chỉ số đếm được trên văn bản: độ dài, độ dài câu, độ đa dạng từ,
 *      từ lặp, từ nối, số đoạn, độ phủ từ khoá của đề.
 *
 * ⚠️ GIỚI HẠN — giao diện phải nói rõ với người học:
 *   - Không đánh giá được NỘI DUNG, LẬP LUẬN, độ mạch lạc thật sự.
 *   - LanguageTool bỏ sót nhiều lỗi phức tạp (cấu trúc câu, dùng từ sai
 *     nghĩa) và đôi khi báo nhầm.
 *   - Các ngưỡng "Tốt / Khá / Cần cải thiện" bên dưới là ngưỡng KINH NGHIỆM,
 *     CHƯA hiệu chỉnh với điểm của người chấm. Đây là mức THAM KHẢO, không
 *     phải band VSTEP.
 */

const BASE_URL = (process.env.LANGUAGETOOL_URL
  || `http://127.0.0.1:${process.env.LANGUAGETOOL_PORT || 8081}`).replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.LANGUAGETOOL_TIMEOUT_MS || 30000);
export const MAX_CHARS = 10000;

// Luật chỉ bắt kiểu chữ in (ngoặc kép cong, gạch dài) — vô nghĩa với bài gõ
// trong ô nhập của trình duyệt, chỉ làm loãng danh sách lỗi.
const DISABLED_RULES = ['EN_QUOTES', 'DASH_RULE'];

// Nhóm lỗi hiện cho người học, theo `rule.category.id` của LanguageTool.
const CATEGORY = {
  TYPOS: 'spelling',
  GRAMMAR: 'grammar',
  CONFUSED_WORDS: 'grammar',
  MISC: 'grammar',              // vd. EN_A_VS_AN: "a apple" -> "an apple"
  COLLOCATIONS: 'grammar',
  NONSTANDARD_PHRASES: 'grammar',
  PUNCTUATION: 'punctuation',
  CASING: 'punctuation',
  TYPOGRAPHY: 'punctuation',
  COMPOUNDING: 'spelling',
  STYLE: 'style',
  REDUNDANCY: 'style',
  PLAIN_ENGLISH: 'style',
  REPETITIONS_STYLE: 'style',
  SEMANTICS: 'style'
};
// Một số luật nằm sai nhóm với cách người học hiểu (vd. "i" viết thường thuộc
// TYPOS của LanguageTool nhưng thực chất là lỗi viết hoa).
const RULE_CATEGORY = {
  I_LOWERCASE: 'punctuation',
  UPPERCASE_SENTENCE_START: 'punctuation'
};
export const CATEGORY_LABEL = {
  grammar: 'Ngữ pháp',
  spelling: 'Chính tả',
  punctuation: 'Dấu câu & viết hoa',
  style: 'Cách diễn đạt'
};

function withTimeout(ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, done: () => clearTimeout(timer) };
}

export async function checkWritingService() {
  const t = withTimeout(3000);
  try {
    const r = await fetch(`${BASE_URL}/v2/languages`, { signal: t.signal });
    return r.ok ? { available: true } : { available: false, reason: `HTTP ${r.status}` };
  } catch (err) {
    return {
      available: false,
      reason: err.name === 'AbortError' ? 'timeout' : err.message,
      hint: 'LanguageTool chạy cùng `npm run dev`. Chưa có thì chạy `npm run lt:setup`.'
    };
  } finally {
    t.done();
  }
}

async function ltCheck(text, language) {
  const t = withTimeout(TIMEOUT_MS);
  try {
    const body = new URLSearchParams({
      text, language, disabledRules: DISABLED_RULES.join(',')
    });
    const r = await fetch(`${BASE_URL}/v2/check`, {
      method: 'POST', body, signal: t.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    if (!r.ok) throw new Error(`LanguageTool HTTP ${r.status}: ${await r.text()}`);
    return (await r.json()).matches || [];
  } finally {
    t.done();
  }
}

/**
 * Lỗi từ LanguageTool. Chạy cả en-US và en-GB: VSTEP chấp nhận cả hai lối
 * chính tả, nên một từ chỉ bị báo SAI CHÍNH TẢ khi CẢ HAI đều báo (không bắt
 * "colour" sai theo Mỹ hay "color" sai theo Anh). Lỗi khác lấy theo en-US.
 */
async function languageIssues(text) {
  const [us, gb] = await Promise.all([ltCheck(text, 'en-US'), ltCheck(text, 'en-GB')]);
  const gbTypos = new Set(gb
    .filter((m) => m.rule?.category?.id === 'TYPOS')
    .map((m) => `${m.offset}:${m.length}`));
  return us
    .filter((m) => m.rule?.category?.id !== 'TYPOS' || gbTypos.has(`${m.offset}:${m.length}`))
    .map((m) => {
      const category = RULE_CATEGORY[m.rule?.id] || CATEGORY[m.rule?.category?.id] || 'style';
      return {
        offset: m.offset,
        length: m.length,
        text: text.slice(m.offset, m.offset + m.length),
        category,
        categoryLabel: CATEGORY_LABEL[category],
        message: m.message,
        shortMessage: m.shortMessage || '',
        replacements: (m.replacements || []).slice(0, 3).map((r) => r.value),
        ruleId: m.rule?.id
      };
    });
}

// ------------------------------------------------------------------ chỉ số

const STOPWORDS = new Set(`a an the and or but if then so of to in on at by for with from as
is am are was were be been being have has had do does did will would can could shall should
may might must i you he she it we they me him her us them my your his its our their mine yours
this that these those there here what which who whom whose when where why how not no yes very
too also just only than more most much many some any all each every other such own same
about into over after before up down out off again further once both few nor s t don
ll re ve d m o y ain`.split(/\s+/));

// Từ/cụm từ nối thường gặp trong bài luận — để đếm mức dùng phương tiện liên
// kết. Có mặt KHÔNG có nghĩa bài mạch lạc; chỉ là dấu hiệu tối thiểu.
const LINKING = [
  'however', 'therefore', 'moreover', 'furthermore', 'in addition', 'additionally',
  'firstly', 'secondly', 'thirdly', 'finally', 'lastly', 'first of all', 'to begin with',
  'in conclusion', 'to conclude', 'to sum up', 'in summary', 'overall',
  'for example', 'for instance', 'such as', 'in particular', 'especially',
  'on the other hand', 'in contrast', 'by contrast', 'whereas', 'while', 'although',
  'even though', 'though', 'despite', 'in spite of', 'nevertheless', 'nonetheless',
  'because', 'since', 'as a result', 'consequently', 'thus', 'hence', 'so that',
  'therefore', 'similarly', 'likewise', 'besides', 'meanwhile', 'otherwise',
  'instead', 'in fact', 'indeed', 'as well as', 'not only', 'in my opinion',
  'from my point of view', 'i believe', 'it is clear that', 'as a consequence',
  'due to', 'owing to', 'unless', 'whether'
];

// Từ chỉ dẫn trong đề bài, không phải từ khoá chủ đề.
const PROMPT_NOISE = new Set(`write essay letter email paragraph words word least about
should give reasons reason include relevant examples example own experience knowledge
opinion agree disagree extent discuss views view task minutes answer question explain
describe following your use using response respond least approximately think people
some others believe whether`.split(/\s+/));

const WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

function words(text) {
  return (text.match(WORD_RE) || []).map((w) => w.toLowerCase());
}

function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => words(s).length > 0);
}

function paragraphs(text) {
  const byBlank = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  // Nhiều người gõ xuống dòng một lần giữa các đoạn.
  return text.split(/\n/).map((p) => p.trim()).filter((p) => words(p).length >= 5);
}

/** Độ đa dạng từ: TTR trung bình trên cửa sổ trượt 50 từ (MATTR) — không
 * bị kéo xuống chỉ vì bài dài, như TTR thường. */
function mattr(ws, win = 50) {
  if (ws.length === 0) return 0;
  if (ws.length <= win) return new Set(ws).size / ws.length;
  let sum = 0;
  const counts = new Map();
  for (let i = 0; i < win; i++) counts.set(ws[i], (counts.get(ws[i]) || 0) + 1);
  sum += counts.size / win;
  for (let i = win; i < ws.length; i++) {
    const out = ws[i - win];
    const c = counts.get(out) - 1;
    if (c === 0) counts.delete(out); else counts.set(out, c);
    counts.set(ws[i], (counts.get(ws[i]) || 0) + 1);
    sum += counts.size / win;
  }
  return sum / (ws.length - win + 1);
}

const stem = (w) => w.replace(/['’]s$/, '').replace(/(ies)$/, 'y').replace(/(?<=[a-z]{3})s$/, '');

function linkingUsed(text) {
  const lower = ` ${text.toLowerCase().replace(/[^a-z'\s]/g, ' ').replace(/\s+/g, ' ')} `;
  const found = [];
  for (const l of new Set(LINKING)) {
    if (lower.includes(` ${l} `)) found.push(l);
  }
  return found;
}

function metrics(text, prompt) {
  const ws = words(text);
  const ss = sentences(text);
  const sl = ss.map((s) => words(s).length);
  const content = ws.filter((w) => !STOPWORDS.has(w) && w.length > 2);
  const promptWords = new Set(words(prompt || '').map(stem));
  const freq = new Map();
  for (const w of content) freq.set(stem(w), (freq.get(stem(w)) || 0) + 1);
  const n = Math.max(ws.length, 1);
  const top = (pred) => [...freq.entries()]
    .filter(pred)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word, count]) => ({ word, count }));
  // "Lặp nhiều": >= 4 lần VÀ chiếm >= 1,5% số từ.
  const repeated = top(([w, c]) => !promptWords.has(w) && c >= 4 && c / n >= 0.015);
  // Từ của ĐỀ BÀI: nhắc lại chủ đề là bình thường, nên ngưỡng cao hơn
  // (>= 5 lần VÀ >= 2%). Vượt ngưỡng thì gợi ý diễn đạt lại bằng từ đồng
  // nghĩa thay vì chép lại từ của đề.
  const promptRepeated = top(([w, c]) => promptWords.has(w) && c >= 5 && c / n >= 0.02);

  let relevance = null;
  if (prompt && prompt.trim()) {
    const kw = [...new Set(words(prompt)
      .filter((w) => !STOPWORDS.has(w) && !PROMPT_NOISE.has(w) && w.length > 3)
      .map(stem))];
    if (kw.length) {
      const have = new Set(content.map(stem));
      const covered = kw.filter((k) => have.has(k));
      relevance = {
        keywords: kw,
        covered,
        missing: kw.filter((k) => !have.has(k)),
        ratio: covered.length / kw.length
      };
    }
  }

  return {
    words: ws.length,
    sentences: ss.length,
    paragraphs: paragraphs(text).length,
    avgSentenceLength: sl.length ? sl.reduce((a, b) => a + b, 0) / sl.length : 0,
    longSentences: ss
      .map((s, i) => ({ index: i, words: sl[i], text: s }))
      .filter((s) => s.words > 35),
    shortSentenceShare: sl.length ? sl.filter((n) => n < 6).length / sl.length : 0,
    lexicalDiversity: mattr(ws),
    repeated,
    promptRepeated,
    linkingWords: linkingUsed(text),
    relevance
  };
}

// ---------------------------------------------------------------- nhận xét

const level = (v, good, ok, higherIsBetter = true) => (higherIsBetter
  ? (v >= good ? 'good' : v >= ok ? 'ok' : 'weak')
  : (v <= good ? 'good' : v <= ok ? 'ok' : 'weak'));

function criteria(m, counts, minWords) {
  const per100 = (n) => (m.words ? (n / m.words) * 100 : 0);
  const gs = per100(counts.grammar + counts.spelling);
  const pc = per100(counts.punctuation);
  const out = [];

  if (minWords > 0) {
    out.push({
      key: 'length', label: 'Độ dài',
      level: m.words >= minWords ? 'good' : m.words >= minWords * 0.8 ? 'ok' : 'weak',
      value: `${m.words} / ${minWords} từ`,
      note: m.words >= minWords ? 'Đủ độ dài yêu cầu.'
        : `Thiếu ${minWords - m.words} từ so với yêu cầu tối thiểu.`
    });
  }
  out.push({
    key: 'grammar', label: 'Ngữ pháp & chính tả',
    level: level(gs, 2, 5, false),
    value: `${counts.grammar + counts.spelling} lỗi · ${gs.toFixed(1)} lỗi / 100 từ`,
    note: gs <= 2 ? 'Ít lỗi ngữ pháp và chính tả mà hệ thống bắt được.'
      : 'Xem các chỗ gạch chân đỏ trong bài và sửa theo gợi ý.'
  });
  out.push({
    key: 'punctuation', label: 'Dấu câu & viết hoa',
    level: level(pc, 1, 3, false),
    value: `${counts.punctuation} lỗi`,
    note: pc <= 1 ? 'Dấu câu và viết hoa ổn.' : 'Chú ý viết hoa đầu câu, dấu phẩy, khoảng trắng.'
  });
  const div = level(m.lexicalDiversity, 0.72, 0.6);
  const reps = m.repeated.length + m.promptRepeated.length;
  const fmt = (list) => list.map((r) => `"${r.word}" ×${r.count}`).join(', ');
  out.push({
    key: 'vocabulary', label: 'Từ vựng',
    level: m.repeated.length >= 3 ? 'weak'
      : reps ? (div === 'weak' ? 'weak' : 'ok')
        : div,
    value: `độ đa dạng ${(m.lexicalDiversity * 100).toFixed(0)}%`,
    note: [
      m.repeated.length ? `Lặp nhiều: ${fmt(m.repeated)}. Thử dùng từ đồng nghĩa.` : null,
      m.promptRepeated.length
        ? `Nhắc lại từ của đề nhiều lần: ${fmt(m.promptRepeated)}. Nhắc lại đề không sai, nhưng tránh lặp nguyên từ của đề quá nhiều — thay bằng từ đồng nghĩa, đại từ (it, this, they) hoặc diễn đạt lại ý.`
        : null
    ].filter(Boolean).join(' ')
      || (m.lexicalDiversity >= 0.72 ? 'Vốn từ khá đa dạng.' : 'Vốn từ còn lặp lại; thử thay bằng từ khác nghĩa tương đương.')
  });
  const avg = m.avgSentenceLength;
  out.push({
    key: 'sentences', label: 'Câu',
    level: (avg >= 12 && avg <= 25 && !m.longSentences.length && m.shortSentenceShare < 0.3) ? 'good'
      : (avg >= 8 && avg <= 30) ? 'ok' : 'weak',
    value: `${m.sentences} câu · trung bình ${avg.toFixed(1)} từ/câu`,
    note: m.longSentences.length
      ? `${m.longSentences.length} câu dài trên 35 từ — nên tách ra cho dễ đọc.`
      : (m.shortSentenceShare >= 0.3 || avg < 12)
        ? 'Câu còn ngắn và đơn giản; thử nối ý bằng because, although, which, when… để câu phong phú hơn.'
        : avg > 25 ? 'Câu khá dài; cân nhắc tách bớt.' : 'Độ dài câu hợp lý.'
  });
  const nl = m.linkingWords.length;
  out.push({
    key: 'cohesion', label: 'Liên kết & bố cục',
    level: (nl >= 5 && m.paragraphs >= 3) ? 'good' : (nl >= 3 && m.paragraphs >= 2) ? 'ok' : 'weak',
    value: `${m.paragraphs} đoạn · ${nl} từ nối khác nhau`,
    note: [
      m.paragraphs < 3 ? 'Nên chia bài thành mở bài, thân bài, kết luận.' : null,
      nl < 5 ? 'Dùng thêm từ nối (however, therefore, for example, in conclusion…) để ý mạch lạc hơn.' : null
    ].filter(Boolean).join(' ') || 'Có chia đoạn và dùng từ nối.'
  });
  if (m.relevance) {
    const r = m.relevance;
    out.push({
      key: 'relevance', label: 'Bám đề (ước lượng)',
      level: level(r.ratio, 0.5, 0.25),
      value: `${r.covered.length}/${r.keywords.length} từ khoá của đề`,
      note: r.missing.length
        ? `Bài ít nhắc tới: ${r.missing.slice(0, 6).join(', ')}. Kiểm tra lại bài có trả lời đúng yêu cầu đề không.`
        : 'Bài có nhắc tới các từ khoá chính của đề.'
    });
  }
  return out;
}

/**
 * Chấm một bài viết. `prompt` (đề bài) và `minWords` không bắt buộc.
 * Ném lỗi có `code = 'LT_UNAVAILABLE'` khi LanguageTool chưa chạy.
 */
export async function assessWriting({ text, prompt = '', minWords = 0 }) {
  const t0 = Date.now();
  let issues;
  try {
    issues = await languageIssues(text);
  } catch (err) {
    const e = new Error('Máy chủ LanguageTool chưa sẵn sàng. Chạy `npm run dev` (hoặc `npm run lt:setup` nếu chưa cài).');
    e.code = 'LT_UNAVAILABLE';
    e.cause = err;
    throw e;
  }
  const counts = { grammar: 0, spelling: 0, punctuation: 0, style: 0 };
  for (const i of issues) counts[i.category] += 1;
  const m = metrics(text, prompt);
  const crit = criteria(m, counts, Number(minWords) || 0);
  return {
    method: 'rule-based',
    engine: 'LanguageTool',
    issues,
    counts,
    stats: m,
    criteria: crit,
    summary: {
      good: crit.filter((c) => c.level === 'good').map((c) => c.label),
      improve: crit.filter((c) => c.level !== 'good').map((c) => c.label)
    },
    disclaimer: 'Chấm bằng luật ngữ pháp và chỉ số thống kê, không dùng AI. Không đánh giá được nội dung, lập luận; có thể bỏ sót hoặc báo nhầm lỗi. Chỉ để tham khảo, không phải điểm VSTEP.',
    elapsedMs: Date.now() - t0
  };
}
