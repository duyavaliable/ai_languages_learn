import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Mic, Square, Loader2, ArrowLeft, RotateCcw, ChevronRight,
  CheckCircle2, AlertTriangle
} from 'lucide-react';
import api from '../services/api';
import { LiveReadingSession, liveTrackingSupported, normWord } from '../lib/liveReading';
import { LiveScoringSession, enReadChars } from '../lib/liveScoring';

/**
 * Trang luyện NÓI. HAI CHẾ ĐỘ, vì hai nhánh model làm được hai việc khác nhau.
 *
 * TIẾNG ANH — ĐỌC LIỀN CẢ ĐOẠN. `PassageSession.score_recording` nhận MỘT bản
 * ghi cả đoạn, cắt ở ranh giới câu bằng cách căn chuỗi âm vị, rồi chấm trọn
 * từng câu. Bài đọc là một đoạn văn; tách thành thẻ một câu làm mất nhịp đọc.
 *
 * ⚠️ KHÔNG gửi cả đoạn làm một chuỗi `text` cho /score. Bước 41 đo được: câu
 * đầu bị căn vào toàn bộ bản ghi, các câu sau cắt lệch, đoạn 3 câu SẠCH bị báo
 * sai 6/13 từ (accuracy 9 -> 4,1). Phải đi qua /score-passage.
 *
 * TIẾNG NHẬT — HAI CÁCH ĐỌC HỘI THOẠI.
 *   - Đọc một lèo (mặc định): MỘT bản ghi gửi /score-passage với `sentences`,
 *     giống tiếng Anh. Dịch vụ cắt ở ranh giới lượt bằng `segment.align_cuts`
 *     (`JaAssessor.score_passage`), chấm trọn từng lượt, rồi trả thêm `scores`
 *     (0-100), `summary` (mức) và `feedback` cho cả hội thoại.
 *   - Đọc theo từng lượt: micro mở một lần, bấm "Câu tiếp"/Space ở mỗi ranh
 *     giới, mỗi lượt chấm riêng qua /score. Không có điểm tổng.
 *
 * ⚠️ Dù cách nào, KHÔNG ghép cả hội thoại thành một chuỗi `text` cho /score:
 * chuỗi âm vị mẫu sẽ căn lệch — đúng lỗi bước 41 đã đo ở tiếng Anh.
 *
 * ⚠️ `target_text` LÀ ĐIỂM MẤU CHỐT. Trang gửi đúng câu lấy từ CSDL, nên hệ
 * thống KHÔNG cần nhận dạng tiếng nói — đó là một đóng góp của đồ án. Đừng đổi
 * sang gửi thứ trình duyệt nghe được.
 */

/** Nhãn bốn tiêu chí mức cả đoạn của nhánh TIẾNG ANH (thang 0–10). */
const UTT_LABELS = [
  ['accuracy', 'Phát âm'],
  ['fluency', 'Độ trôi chảy'],
  ['prosodic', 'Ngữ điệu'],
  ['total', 'Tổng']
];

/**
 * ----- KẾT QUẢ TIẾNG NHẬT, VIẾT CHO NGƯỜI HỌC -----
 *
 * Dịch vụ chấm trả rất nhiều chữ kỹ thuật (bước, mốc, ngưỡng, căn cứ...). Người
 * học không cần những thứ đó, nên ở đây CHỈ lấy các con số rồi tự viết lời
 * nhận xét ngắn. Tiêu chí nào không đo được thì không hiện gì cả.
 */

/** Ba mức của dịch vụ, theo thứ tự `bands_in_order` (tốt -> kém). */
const JA_LEVELS = [
  {
    label: 'Tốt',
    desc: 'Bạn đọc gần giống người Nhật. Giữ phong độ nhé!',
    cls: 'bg-emerald-50 border-emerald-200 text-emerald-800'
  },
  {
    label: 'Khá',
    desc: 'Bạn đọc khá ổn, chỉ cần luyện thêm một chút.',
    cls: 'bg-sky-50 border-sky-200 text-sky-800'
  },
  {
    label: 'Cần luyện thêm',
    desc: 'Đừng nản! Luyện các từ bên dưới rồi đọc lại, bạn sẽ thấy tiến bộ.',
    cls: 'bg-amber-50 border-amber-200 text-amber-900'
  }
];

/** Từ bị model chấm sai trong kết quả /score của MỘT câu tiếng Anh. */
function enFlaggedWords(data) {
  if (Array.isArray(data?.practice_words)) {
    return data.practice_words.map((w) => (typeof w === 'string' ? w : w?.text || w?.word || ''));
  }
  return (data?.words || [])
    .filter((w) => w.flagged || w.practice)
    .map((w) => w.text || w.word || '');
}

/** カタカナ -> ひらがな, bỏ dấu trọng âm (') mà dịch vụ chèn vào cách đọc. */
function toHiragana(s) {
  return String(s || '')
    .replace(/['’]/g, '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

function parseNum(s) {
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Danh sách từ cần luyện: chữ + cách đọc hiragana (+ số câu nếu có). */
function WordChips({ words, max }) {
  const [all, setAll] = useState(false);
  const shown = !max || all ? words : words.slice(0, max);
  return (
    <div className="flex flex-wrap gap-2">
      {shown.map((w, i) => {
        const reading = toHiragana(w.reading);
        return (
          <span key={i} className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-sm font-semibold">
            {w.text}
            {reading && reading !== w.text && (
              <span className="font-normal opacity-70"> ({reading})</span>
            )}
            {typeof w.sentence === 'number' && (
              <span className="font-normal opacity-50 text-xs"> · câu {w.sentence + 1}</span>
            )}
          </span>
        );
      })}
      {max && words.length > max && (
        <button
          onClick={() => setAll(!all)}
          className="px-2.5 py-1 rounded-full text-sm text-slate-500 hover:text-slate-700 underline"
        >
          {all ? 'Thu gọn' : `Xem tất cả (${words.length})`}
        </button>
      )}
    </div>
  );
}

/** Viết lời nhận xét từ các con số đo được. Chỉ tiêu chí đo được mới có câu. */
function buildJaComments(result, flaggedCount, totalWords) {
  const out = [];

  if (totalWords) {
    const rate = flaggedCount / totalWords;
    if (rate < 0.1) {
      out.push({ good: true, text: 'Phát âm của bạn rất tốt, hầu hết các từ đều rõ ràng.' });
    } else if (rate < 0.25) {
      out.push({ good: true, text: `Phát âm khá tốt, chỉ còn ${flaggedCount} từ đọc chưa chuẩn.` });
    } else {
      out.push({
        good: false,
        text: `Có ${flaggedCount} từ bạn đọc chưa chuẩn. Hãy nghe và đọc riêng từng từ ở danh sách bên dưới trước, rồi mới đọc lại cả bài.`
      });
    }
  }

  const fluency = result.scores?.total;
  if (typeof fluency === 'number') {
    if (fluency >= 70) {
      out.push({ good: true, text: 'Bạn đọc trôi chảy, ít bị ngập ngừng.' });
    } else if (fluency >= 40) {
      out.push({ good: false, text: 'Bạn còn ngập ngừng ở một số chỗ. Đọc lại vài lần cho quen câu sẽ trôi hơn.' });
    } else {
      out.push({ good: false, text: 'Bạn ngập ngừng khá nhiều. Thử đọc chậm lại nhưng liền mạch, đừng dừng giữa câu.' });
    }
  }

  const notes = result.feedback?.notes || [];

  // Ngắt giữa một từ: lấy vài từ ví dụ từ câu nhận xét gốc nếu tách được.
  const split = notes.find((n) => /ngắt giữa từ/i.test(n.topic || '') && n.level !== 'good');
  if (split) {
    const m = /từ:\s*(.+?)\.\s/.exec(split.text || '');
    const examples = m ? m[1].split('·').map((s) => s.trim()).filter(Boolean).slice(0, 3) : [];
    out.push({
      good: false,
      text: 'Bạn hay dừng lại giữa chừng một từ'
        + (examples.length ? ` (ví dụ: ${examples.join(', ')})` : '')
        + '. Hãy đọc trọn mỗi từ trong một hơi.'
    });
  }

  // Tốc độ: chỉ nhắc khi chậm hơn hẳn người Nhật, và nói nhẹ nhàng.
  const speed = notes.find((n) => /tốc độ/i.test(n.topic || ''));
  const sm = speed && /([\d.,]+)\s*mora\/giây\D*([\d.,]+)/.exec(speed.text || '');
  if (sm) {
    const mine = parseNum(sm[1]);
    const native = parseNum(sm[2]);
    if (mine && native && mine < native * 0.6) {
      out.push({
        good: false,
        text: 'Bạn đọc khá chậm so với người Nhật. Không sao cả, cứ đọc rõ trước, quen rồi sẽ nhanh dần.'
      });
    }
  }

  return out;
}

function JaResultCard({ result }) {
  const words = result.feedback?.practice_words || [];
  const wc = result.summary?.criteria?.word_correctness?.counts || {};
  const totalWords = wc.measurable_words || 0;
  const flaggedCount = wc.flagged ?? words.length;

  const order = result.summary?.bands_in_order || [];
  let levelIdx = order.indexOf(result.summary?.overall_band);
  if (levelIdx < 0 && totalWords) {
    const rate = flaggedCount / totalWords;
    levelIdx = rate < 0.1 ? 0 : rate < 0.25 ? 1 : 2;
  }
  const level = JA_LEVELS[levelIdx];
  const fluency = result.scores?.total;
  const comments = buildJaComments(result, flaggedCount, totalWords);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
      <h3 className="font-bold text-slate-900 text-lg">Kết quả của bạn</h3>

      {level && (
        <div className={`rounded-xl border p-4 ${level.cls}`}>
          <p className="text-2xl font-bold">{level.label}</p>
          <p className="text-sm mt-1">{level.desc}</p>
        </div>
      )}

      {(totalWords > 0 || typeof fluency === 'number') && (
        <div className="grid grid-cols-2 gap-3">
          {totalWords > 0 && (
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500 font-medium">Từ đọc đúng</p>
              <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {totalWords - flaggedCount}
                <span className="text-base text-slate-400 font-semibold">/{totalWords}</span>
              </p>
            </div>
          )}
          {typeof fluency === 'number' && (
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500 font-medium">Độ trôi chảy</p>
              <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {fluency}
                <span className="text-base text-slate-400 font-semibold">/100</span>
              </p>
            </div>
          )}
        </div>
      )}

      {comments.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">Nhận xét</p>
          <ul className="space-y-2">
            {comments.map((c, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-slate-700 leading-snug">
                {c.good
                  ? <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                  : <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />}
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {words.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">
            Từ cần luyện
            <span className="font-normal text-slate-400 text-xs"> (từ cần luyện nhất ở đầu)</span>
          </p>
          <WordChips words={words} max={10} />
        </div>
      )}

      <p className="text-xs text-slate-400">
        Mẹo: bấm vào từng câu trong hội thoại ở trên để xem câu đó có từ nào cần luyện.
      </p>
    </div>
  );
}

/**
 * Các CHỖ cần tô đỏ trong một câu tiếng Nhật: `[{ start, end, text, reading }]`.
 *
 * "Từ" của model là một CỤM: luật 1 bước 47 gộp trợ từ/trợ động từ vào từ
 * đứng trước (そっくり+です, 性格+も). Cờ được tính cho cả cụm — đó là đơn vị
 * đã kiểm — nhưng điểm của cụm là điểm của âm TỆ NHẤT trong cụm, nên dịch vụ
 * biết âm lệch nằm ở phần nào (`parts[].flagged`). Ở đây chỉ tô PHẦN đó:
 * そっくりです lệch ở そっくり thì tô そっくり; まじめで lệch ở で thì tô で.
 * Dịch vụ không chia được cụm (`parts` thiếu) thì tô cả cụm như trước.
 */
function flaggedSpans(text, words) {
  const spans = [];
  let from = 0;
  for (const w of words || []) {
    const at = w.text ? text.indexOf(w.text, from) : -1;
    if (at < 0) continue;
    from = at + w.text.length;
    if (!w.flagged) continue;
    const parts = Array.isArray(w.parts) && w.parts.some((p) => p.flagged)
      && w.parts.map((p) => p.text).join('') === w.text ? w.parts : null;
    if (!parts) {
      // Tô cả cụm: gồm nhiều token (楽しい+だろう+ね) thì là "cụm từ".
      const phrase = !Array.isArray(w.parts) || w.parts.length > 1;
      spans.push({ start: at, end: from, text: w.text, reading: w.reading || '', phrase });
      continue;
    }
    let pos = at;
    for (const p of parts) {
      if (p.flagged) {
        spans.push({ start: pos, end: pos + p.text.length, text: p.text, reading: p.reading || '', phrase: false });
      }
      pos += p.text.length;
    }
  }
  return spans;
}

/** "2 từ", "1 cụm từ", "2 từ, 1 cụm từ" — đếm đúng các khối đỏ của `flaggedSpans`. */
function spanCount(spans) {
  const phrases = spans.filter((s) => s.phrase).length;
  const words = spans.length - phrases;
  return [words && `${words} từ`, phrases && `${phrases} cụm từ`].filter(Boolean).join(', ');
}

/**
 * Hiện câu tiếng Nhật kèm furigana (hiragana nhỏ trên kanji, như giáo trình
 * Minna no Nihongo). Từ model chấm sai -> chữ đỏ; phần CHƯA đọc tới (từ ký tự
 * `readUntil` trở đi, khi đang ghi âm) -> chữ xám.
 *
 * `segments` do /api/furigana trả về: các đoạn `{ text, ruby? }` nối lại đúng
 * bằng câu gốc. Chưa có (đang tải / lỗi) thì hiện câu trơn.
 *
 * `words` là MỌI từ của câu (cả từ không bị cờ), để tìm vị trí lần lượt từ
 * trái sang phải — một từ lặp lại trong câu không bị tô nhầm chỗ.
 */
function renderJaLine(text, segments, words = [], readUntil = Infinity) {
  const ranges = flaggedSpans(text, words);
  const hit = (a, b) => ranges.find((r) => a < r.end && b > r.start);
  // Mỗi CHỖ lệch là MỘT khối: nền đỏ nhạt + gạch chân liền, bo góc ở hai đầu.
  // Tiếng Nhật viết liền không dấu cách, nên chỉ tô chữ đỏ thì "ここは" trông
  // như ba chữ sai, và hai chỗ sai đứng sát nhau trông như một — người học
  // không khớp được với "N từ cần luyện" ở nhãn bên cạnh.
  const flagCls = (r, a, b) => [
    'text-red-600 bg-red-50 underline decoration-red-400 decoration-2 underline-offset-4',
    a <= r.start ? 'rounded-l ml-0.5 pl-0.5' : '',
    b >= r.end ? 'rounded-r mr-0.5 pr-0.5' : ''
  ].join(' ');

  const segs = Array.isArray(segments) && segments.map((s) => s.text).join('') === text
    ? segments : [{ text }];

  const out = [];
  let pos = 0;
  segs.forEach((s, k) => {
    const a = pos;
    const b = pos + s.text.length;
    pos = b;
    if (s.ruby) {
      const node = (
        <ruby key={k}>
          {s.text}<rt className="text-[0.5em] text-slate-500 font-normal">{s.ruby}</rt>
        </ruby>
      );
      const r = hit(a, b);
      out.push(
        <span key={k} className={r ? flagCls(r, a, b) : a >= readUntil ? 'text-slate-400' : ''} title={r?.reading}>
          {node}
        </span>
      );
      return;
    }
    // Đoạn kana: cắt đúng ở biên của từ bị gắn cờ và ở vị trí đang đọc.
    const cuts = [a, b];
    for (const r of ranges) {
      if (r.start > a && r.start < b) cuts.push(r.start);
      if (r.end > a && r.end < b) cuts.push(r.end);
    }
    if (readUntil > a && readUntil < b) cuts.push(readUntil);
    cuts.sort((x, y) => x - y);
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const piece = text.slice(cuts[i], cuts[i + 1]);
      if (!piece) continue;
      const r = hit(cuts[i], cuts[i + 1]);
      const cls = r ? flagCls(r, cuts[i], cuts[i + 1])
        : cuts[i] >= readUntil ? 'text-slate-400' : '';
      out.push(<span key={`${k}-${i}`} className={cls} title={r?.reading}>{piece}</span>);
    }
  });
  return out;
}

/**
 * Hạn chờ RIÊNG cho lượt chấm.
 *
 * `api` đặt `timeout: 10000` dùng chung — hợp với CRUD, nhưng chấm trên CPU lâu
 * hơn thế nhiều. Để nguyên 10 giây thì TRÌNH DUYỆT bỏ cuộc giữa đường trong khi
 * Python vẫn chấm xong và trả 200 vào một kết nối không còn ai nghe — người học
 * thấy "không chấm được" trong khi model không hề lỗi. Đây đúng là lỗi đã gặp.
 *
 * Đặt DÀI HƠN hạn 180 giây Express chờ Python (`PRONUNCIATION_TIMEOUT_MS`), để
 * khi quá giờ thật thì thông điệp 504 có lời giải thích của Express tới được
 * màn hình, thay vì bị lỗi hết giờ chung chung của axios che mất.
 */
const SCORING_TIMEOUT_MS = 200000;

/**
 * Micro KHÔNG qua bộ lọc của trình duyệt.
 *
 * Mặc định Chrome bật lọc ồn, khử vọng và tự chỉnh âm lượng. Chúng cần vài
 * trăm mili giây đầu để ổn định và hay làm yếu phụ âm bật hơi (k/t/p) — trong
 * khi ngưỡng chấm của model hiệu chỉnh trên bản ghi KHÔNG qua xử lý. Phiên web
 * 29/10 15:53: "ここは" bị cờ chắc (biên −5,40) chỉ vì phụ âm "k" ĐẦU TIÊN của
 * bản ghi, mọi âm khác của câu bình thường và model vẫn nghe ra "k o k o w a".
 */
const MIC_CONSTRAINTS = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
};

function SpeakingPracticePage() {
  const navigate = useNavigate();
  const { exerciseId } = useParams();

  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [serviceState, setServiceState] = useState(null);

  const [recording, setRecording] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [result, setResult] = useState(null);
  const [scoreError, setScoreError] = useState('');
  const [elapsed, setElapsed] = useState(0);

  // Tiếng Nhật: lượt đang đọc / đang chấm, kết quả và lỗi của từng lượt.
  const [activeTurn, setActiveTurn] = useState(null);
  const [scoringTurn, setScoringTurn] = useState(null);
  const [turnResults, setTurnResults] = useState({});
  const [turnErrors, setTurnErrors] = useState({});
  // Lượt người học CHƯA ĐỌC hoặc ĐỌC DỞ khi bấm dừng: không chấm, không phải
  // lỗi. Trước đây dịch vụ ép cả phần chưa đọc vào cuối bản ghi rồi chấm nó.
  const [turnSkipped, setTurnSkipped] = useState({});
  const [openTurn, setOpenTurn] = useState(null);
  // Đang ở cách đọc nào. Hai cách dùng chung cờ `recording` nhưng nút khác
  // nhau: đọc một lèo chỉ có "Dừng và chấm", đọc từng lượt có "Câu tiếp".
  const [oneShot, setOneShot] = useState(true);

  // Phiên ghi hội thoại: micro mở một lần, mỗi lượt một MediaRecorder.
  const sessionRef = useRef(null);
  // Kết quả từng lượt, giữ trong ref SONG SONG với state `turnResults`: hàm
  // lưu lịch sử chạy ngay sau vòng chấm, mà `setTurnResults` chưa kịp áp
  // dụng nên đọc state ở đó sẽ ra bản cũ.
  const scoredRef = useRef({});

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  // Việc phải làm khi dừng ghi. Giữ trong ref chứ không trong state: `onstop`
  // của MediaRecorder bắt giá trị lúc gắn, nên state sẽ cũ.
  const onBlobRef = useRef(null);

  useEffect(() => {
    if (!scoring) return undefined;
    setElapsed(0);
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [scoring]);

  useEffect(() => {
    api.get('/pronunciation/health')
      .then((r) => setServiceState(r.data))
      .catch(() => setServiceState({ available: false }));
  }, []);

  useEffect(() => {
    let alive = true;
    api.get(`/exercises/${exerciseId}`)
      .then((res) => {
        if (!alive) return;
        const ex = res.data || {};
        let lines = [];
        try {
          const raw = typeof ex.questions_json === 'string'
            ? JSON.parse(ex.questions_json) : (ex.questions_json || []);
          lines = Array.isArray(raw)
            ? raw.filter((x) => x && typeof x.text === 'string')
            : [];
        } catch { lines = []; }
        setExercise({ ...ex, lines });
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError('Không tải được bài đọc');
        setLoading(false);
      });
    return () => { alive = false; };
  }, [exerciseId]);

  /**
   * Mã ngôn ngữ của bài.
   *
   * `getExerciseById` LÀM PHẲNG quan hệ: `payload.language = payload.language
   * ?.code` — nên trường trả về là CHUỖI "ja", không phải đối tượng. Đọc
   * `language.code` ở đây cho ra `undefined` rồi rơi về 'en', và bài tiếng Nhật
   * bị gửi sang model tiếng Anh. Đây là lỗi đã mắc. Nhận cả hai dạng để không
   * phụ thuộc vào việc controller có đổi cách trả hay không.
   */
  const langCode = useMemo(() => {
    const raw = exercise?.language;
    const code = typeof raw === 'string' ? raw : raw?.code;
    return String(code || 'en').toLowerCase().slice(0, 2);
  }, [exercise]);

  const isDialogue = langCode === 'ja';
  const lines = exercise?.lines || [];
  const sentences = useMemo(() => lines.map((l) => l.text), [lines]);

  // Furigana cho lời thoại và tên vai. Lỗi thì thôi, câu vẫn hiện trơn.
  const [furigana, setFurigana] = useState({ lines: [], speakers: [] });
  useEffect(() => {
    if (!isDialogue || !lines.length) return undefined;
    let alive = true;
    const speakers = lines.map((l) => l.speaker || '');
    api.post('/furigana', { texts: [...sentences, ...speakers] })
      .then((res) => {
        if (!alive) return;
        const segs = res.data?.segments || [];
        setFurigana({
          lines: segs.slice(0, sentences.length),
          speakers: segs.slice(sentences.length)
        });
      })
      .catch(() => { });
    return () => { alive = false; };
  }, [isDialogue, lines, sentences]);

  /** Tra cứu kết quả theo chỉ số câu, để tô màu đúng câu trong đoạn văn. */
  const byIndex = useMemo(() => {
    const m = new Map();
    for (const s of result?.sentences || []) m.set(s.index, s);
    return m;
  }, [result]);

  /* ================= CHẤM TRONG LÚC ĐANG ĐỌC =================
     Trình duyệt chỉ dò VỊ TRÍ đọc (xem src/lib/liveReading.js). Đọc xong câu
     nào thì câu đó được gửi cho MODEL CỦA ĐỒ ÁN chấm ngay (/pronunciation/
     score), trong lúc người học đọc câu tiếp — chữ đỏ chỉ đến từ đây.
     Bấm dừng ở chế độ đọc một lèo thì vẫn chấm lại cả bài bằng
     /score-passage như cũ, và kết quả đó thay kết quả từng câu. */
  const liveRef = useRef(null);
  const [livePtr, setLivePtr] = useState(0);
  const [liveEn, setLiveEn] = useState({}); // tiếng Anh: câu -> từ sai
  // Mỗi lượt đọc một số hiệu; kết quả về muộn của lượt cũ thì bỏ.
  const liveGenRef = useRef(0);
  // Chấm LẦN LƯỢT từng câu, không gửi dồn: dịch vụ chạy trên CPU.
  const liveQueueRef = useRef(Promise.resolve());

  const stopLive = (discardPending) => {
    liveRef.current?.stop();
    liveRef.current = null;
    if (discardPending) liveGenRef.current += 1;
  };

  const startLive = (stream, autoCut) => {
    stopLive(true);
    const gen = liveGenRef.current;
    liveQueueRef.current = Promise.resolve();
    scoredRef.current = {};
    setLivePtr(0);
    setLiveEn({});
    try {
      liveRef.current = new LiveReadingSession({
        stream,
        sentences,
        lang: langCode,
        autoCut,
        onProgress: setLivePtr,
        onSentence: (i, wav) => enqueueScore(gen, i, wav, 'sentence.wav', false)
      });
    } catch {
      liveRef.current = null; // không dò được vị trí thì vẫn ghi âm bình thường
    }
    return gen;
  };

  /** Gửi một câu cho model chấm, xếp hàng sau các câu trước. */
  const enqueueScore = (gen, i, blob, filename, showErrors) => {
    liveQueueRef.current = liveQueueRef.current.then(async () => {
      if (gen !== liveGenRef.current) return;
      setScoringTurn(i);
      try {
        const fd = new FormData();
        fd.append('audio', blob, filename);
        fd.append('language', langCode);
        fd.append('text', sentences[i]);
        const res = await api.post('/pronunciation/score', fd,
          { timeout: SCORING_TIMEOUT_MS });
        if (gen !== liveGenRef.current) return;
        if (langCode === 'ja') {
          scoredRef.current[i] = res.data;
          setTurnResults((m) => ({ ...m, [i]: res.data }));
        } else {
          setLiveEn((m) => ({ ...m, [i]: enFlaggedWords(res.data) }));
        }
      } catch (err) {
        // Đọc một lèo: lỗi một câu thì thôi, bấm dừng sẽ chấm lại cả bài.
        if (showErrors && gen === liveGenRef.current) {
          setTurnErrors((m) => ({ ...m, [i]: explain(err) }));
        }
      } finally {
        setScoringTurn((t) => (t === i ? null : t));
      }
    });
    return liveQueueRef.current;
  };

  /* ================= CHẤM TRỰC TIẾP (đọc một lèo) =================
     MODEL tự biết người học đọc tới đâu — xem src/lib/liveScoring.js và
     train-Ai/src/stream.py. Không còn dựa vào Web Speech để cắt câu, nên
     trình duyệt nghe lệch hay rớt mạng cũng không làm việc chấm đứng lại.
     Tiếng Anh: chữ đỏ hiện từng từ ngay giữa câu. Tiếng Nhật: con trỏ chạy
     từng từ, chữ đỏ hiện khi xong câu (điểm từ tiếng Nhật so với trung vị CẢ
     câu nên phải đủ câu mới đúng phép đo đã kiểm). */
  const liveScoringRef = useRef(null);
  const [liveRead, setLiveRead] = useState(null); // câu -> số ký tự đã đọc
  const [liveStatus, setLiveStatus] = useState(null);

  const stopLiveScoring = () => {
    liveScoringRef.current?.stop();
    liveScoringRef.current = null;
    setLiveRead(null);
    setLiveStatus(null);
  };

  const applyLiveView = (gen, view) => {
    if (gen !== liveGenRef.current || !view) return;
    const rows = view.sentences || [];
    const read = {};
    for (const s of rows) {
      // "đã đọc" = model đã chốt câu, cờ đang chấm ở nền (hiện ở lượt sau)
      if (s.state === 'đã chấm' || s.state === 'đã đọc') read[s.index] = Infinity;
      else if (view.language === 'ja') read[s.index] = s.read_chars || 0;
      else {
        // `read_words`: vị trí đọc theo phép so khớp (tới HẾT từ đang nói).
        // Dịch vụ cũ không có thì đếm từ đã có điểm tạm — chậm hơn một từ.
        const heard = s.read_words ?? (s.words || []).filter((w) => w.state !== 'chưa đọc').length;
        read[s.index] = enReadChars(sentences[s.index] || '', heard);
      }
    }
    setLiveRead(read);
    if (view.language === 'ja') {
      setTurnResults((m) => {
        let next = m;
        for (const s of rows) {
          if (s.result?.scored && !m[s.index]) {
            if (next === m) next = { ...m };
            next[s.index] = s.result;
          }
        }
        return next;
      });
      setActiveTurn(view.current < rows.length ? view.current : null);
    } else {
      setLiveEn(Object.fromEntries(rows.map((s) => [s.index, s.practice_words || []])));
    }
  };

  const startLiveScoring = (stream) => {
    stopLive(true);
    stopLiveScoring();
    const gen = liveGenRef.current;
    setLiveEn({});
    const s = new LiveScoringSession({
      stream,
      sentences,
      lang: langCode,
      onUpdate: (view) => applyLiveView(gen, view),
      onStatus: (st) => { if (gen === liveGenRef.current) setLiveStatus(st); }
    });
    liveScoringRef.current = s;
    s.start().catch(() => setLiveStatus({
      state: 'failed', message: 'Không thu được âm thanh để chấm trực tiếp'
    }));
  };

  /** Số ký tự đã đọc của câu i; ngoài lúc ghi âm thì coi như đọc hết. */
  const readTo = (i) => {
    if (!recording) return Infinity;
    if (liveRead) return liveRead[i] ?? 0;
    return liveRef.current && livePtr > 0 ? liveRef.current.readChars(i) : Infinity;
  };

  const startRecording = async (onBlob) => {
    setScoreError('');
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      onBlobRef.current = onBlob;
      rec.ondataavailable = (e) => {
        if (e.data?.size) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await onBlobRef.current?.(blob);
      };
      recorderRef.current = rec;
      rec.start();
      startLiveScoring(stream);
      setRecording(true);
    } catch {
      setScoreError('Không mở được micro. Kiểm tra quyền truy cập của trình duyệt.');
    }
  };

  const stopRecording = () => {
    // Câu nào chưa kịp chấm thì bỏ: lần chấm cả bài ngay sau đây sẽ chấm hết.
    stopLive(true);
    stopLiveScoring();
    recorderRef.current?.stop();
    setRecording(false);
    setActiveTurn(null);
  };

  /** Dịch lỗi hết giờ thành câu nói rõ model vẫn chạy, chỉ là chưa kịp xong. */
  const explain = (err) => {
    if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '')) {
      return `Quá ${Math.round(SCORING_TIMEOUT_MS / 1000)} giây chưa chấm xong `
        + 'nên đã dừng chờ. Bản ghi có thể quá dài — thử phần ngắn hơn.';
    }
    return err?.response?.data?.message || 'Không chấm được bản ghi';
  };

  /**
   * Lưu lần chấm vào `speaking_attempts`.
   *
   * GỬI NGUYÊN GÓI, không gửi điểm đã rút. Server tự rút các cột từ gói đó
   * (`extractAttempt`), nên trình duyệt không tự khai điểm cho mình được.
   *
   * KHÔNG chặn giao diện và KHÔNG báo lỗi lên màn hình nếu lưu thất bại:
   * người học vừa đọc xong và đang muốn xem kết quả: che kết quả bằng một lỗi
   * của việc ghi lịch sử là đổi sai thứ tự ưu tiên. Lỗi chỉ ghi ra console.
   */
  const saveAttempt = (data, mode) => {
    if (!data || data.error) return;
    api.post('/speaking-attempts', {
      exercise_id: Number(exerciseId) || null,
      language_id: langCode === 'ja' ? 2 : 1,
      mode,
      result: data
    }).catch((err) => {
      console.warn('Không lưu được lần chấm:',
        err?.response?.data?.message || err?.message);
    });
  };

  // ----- TIẾNG ANH: một bản ghi cả đoạn -----
  const scorePassage = async (blob) => {
    setScoring(true);
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'recording.webm');
      fd.append('language', 'en');
      fd.append('sentences', JSON.stringify(sentences));
      const res = await api.post('/pronunciation/score-passage', fd,
        { timeout: SCORING_TIMEOUT_MS });
      if (res.data?.error) {
        setResult(null);
        setScoreError([res.data.error, res.data.note].filter(Boolean).join(' — '));
        return;
      }
      setResult(res.data);
      saveAttempt(res.data, 'passage');
    } catch (err) {
      setScoreError(explain(err));
    } finally {
      setScoring(false);
    }
  };

  /**
   * ----- TIẾNG NHẬT, ĐỌC MỘT LÈO: MỘT bản ghi cho cả hội thoại -----
   *
   * Giống hẳn đường tiếng Anh. Trước đây nhánh tiếng Nhật không làm được việc
   * này, nhưng lý do không phải vì thiếu thành phần: `segment.align_cuts`
   * không gắn với ngôn ngữ nào, và model tiếng Nhật cũng là model CTC trên âm
   * vị, nên nó có đủ log-xác suất theo khung để căn. Chỉ là chưa ai nối hai
   * thứ đó lại — nay đã nối ở `JaAssessor.score_passage`.
   *
   * Người học đọc liền, không bấm gì giữa các lượt. Dịch vụ cắt bản ghi ở
   * ranh giới câu rồi chấm trọn từng lượt.
   *
   * Vẫn GIỮ đường đọc theo từng lượt bên dưới: hội thoại có lượt chỉ ba ký tự
   * (ええ。) và đọc một lèo cả hai vai không phải cách ai cũng muốn tập.
   */
  const scorePassageJa = async (blob) => {
    setScoring(true);
    setTurnErrors({});
    setTurnSkipped({});
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'recording.webm');
      fd.append('language', 'ja');
      fd.append('sentences', JSON.stringify(sentences));
      const res = await api.post('/pronunciation/score-passage', fd,
        { timeout: SCORING_TIMEOUT_MS });
      // Hai trường hợp dịch vụ trả 200 mà KHÔNG chấm: tra không ra cách đọc
      // của một câu, hoặc không cắt được bản ghi. Khi đó không có `sentences`,
      // chỉ có `error` + `note` — phải hiện ra, nếu không màn hình im lặng như
      // thể chưa bấm gì.
      if (res.data?.error) {
        setResult(null);
        setTurnResults({});
        setScoreError([res.data.error, res.data.note].filter(Boolean).join(' — '));
        return;
      }
      setResult(res.data);
      saveAttempt(res.data, 'passage');
      // Dịch vụ gắn `criteria` cho từng câu đúng hình dạng của phép chấm lẻ,
      // nên đổ thẳng vào `turnResults` là dùng lại được bộ hiển thị từng lượt.
      // Lượt `scored: false` (khúc cắt ra quá ngắn) hiện thành lỗi của lượt đó.
      const m = {};
      const errs = {};
      const skipped = {};
      for (const row of res.data?.sentences || []) {
        if (row?.scored) m[row.index] = row;
        else if (row?.read_state === 'chưa đọc' || row?.read_state === 'đọc dở') {
          skipped[row.index] = row.read_state;
        } else if (row) errs[row.index] = row.note || 'Lượt này không chấm được';
      }
      setTurnResults(m);
      setTurnErrors(errs);
      setTurnSkipped(skipped);
    } catch (err) {
      setScoreError(explain(err));
    } finally {
      setScoring(false);
    }
  };

  // ----- TIẾNG NHẬT: một nút cho cả hội thoại, mỗi lượt một bản ghi -----

  /** Bật MediaRecorder cho lượt `i` trên luồng micro đã mở sẵn. */
  const recordTurn = (session, i) => {
    const rec = new MediaRecorder(session.stream);
    const chunks = [];
    session.blobs[i] = new Promise((resolve) => {
      rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      rec.onstop = () => resolve(new Blob(chunks, { type: 'audio/webm' }));
    });
    session.recorder = rec;
    rec.start();
    setActiveTurn(i);
  };

  /**
   * Chờ các lượt đang chấm dở rồi lưu lịch sử. Mỗi lượt đã được gửi chấm
   * NGAY khi người học bấm "Câu tiếp" (xem `advanceDialogue`), nên tới đây
   * thường chỉ còn lượt cuối. Lượt lỗi không chặn các lượt sau.
   */
  const finishDialogue = async (session) => {
    setScoring(true);
    await Promise.all(session.scoring);
    setScoringTurn(null);
    setScoring(false);
    const blobs = session.blobs;

    // MỘT dòng cho CẢ hội thoại, không phải một dòng mỗi lượt. Lý do: số đo
    // cần cộng cả đoạn mới có nghĩa — `n_words` của một lượt ba ký tự thì
    // không nói được gì. Ghép lại đúng hình dạng `sentences` mà server chờ.
    const rows = [];
    for (let i = 0; i < blobs.length; i += 1) {
      const r = scoredRef.current[i];
      if (r) rows.push({ ...r, index: i, scored: true });
    }
    if (rows.length) {
      saveAttempt({ language: 'ja', sentences: rows }, 'turns');
    }
  };

  const startDialogue = async () => {
    setScoreError('');
    scoredRef.current = {};
    setTurnResults({});
    setTurnErrors({});
    setTurnSkipped({});
    setOpenTurn(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
      const session = { stream, recorder: null, blobs: [], scoring: [] };
      sessionRef.current = session;
      recordTurn(session, 0);
      session.gen = startLive(stream, false);
      setRecording(true);
    } catch {
      setScoreError('Không mở được micro. Kiểm tra quyền truy cập của trình duyệt.');
    }
  };

  /** Kết thúc lượt đang đọc; sang lượt kế, hoặc dừng và chấm nếu là lượt cuối. */
  const advanceDialogue = useCallback(async () => {
    const session = sessionRef.current;
    if (!session?.recorder) return;
    const i = session.blobs.length - 1;
    session.recorder.stop();
    // Chấm lượt vừa đọc NGAY, trong lúc người học đọc lượt sau.
    session.scoring.push(session.blobs[i].then((blob) => enqueueScore(
      session.gen, i, blob, 'recording.webm', true)));
    if (i + 1 < lines.length) {
      recordTurn(session, i + 1);
      liveRef.current?.jumpTo(i + 1);
      return;
    }
    session.recorder = null;
    sessionRef.current = null;
    stopLive(false);
    setRecording(false);
    setActiveTurn(null);
    await Promise.all(session.blobs);
    session.stream.getTracks().forEach((t) => t.stop());
    await finishDialogue(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  const cancelDialogue = () => {
    const session = sessionRef.current;
    if (!session) return;
    stopLive(true);
    session.recorder?.stop();
    session.stream.getTracks().forEach((t) => t.stop());
    sessionRef.current = null;
    setRecording(false);
    setActiveTurn(null);
  };

  // Phím Space = bấm nút chính khi đang đọc hội thoại.
  useEffect(() => {
    // Ở chế độ đọc một lèo KHÔNG gắn Space: không có "câu tiếp" nào để sang,
    // và bấm Space lúc đó sẽ dừng ghi giữa bài.
    if (!isDialogue || !recording || oneShot) return undefined;
    const onKey = (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      // Nút đang giữ focus sẽ tự "click" khi nhả Space -> sang hai câu một lúc.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      advanceDialogue();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDialogue, recording, oneShot, advanceDialogue]);

  // Rời trang giữa chừng thì phải tắt micro.
  useEffect(() => () => {
    liveRef.current?.stop();
    liveScoringRef.current?.stop();
    sessionRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const practiceWords = result?.practice_words || [];
  const busy = recording || scoring;
  const scoredCount = Object.keys(turnResults).length;
  const isLastTurn = activeTurn === lines.length - 1;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="h-16 bg-white border-b border-slate-100 flex items-center gap-4 px-6 sticky top-0 z-20">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200"
        >
          <ArrowLeft className="w-4 h-4" /> Về danh sách bài
        </button>
        <h1 className="text-lg font-bold text-slate-900">
          {isDialogue ? 'Luyện nói — hội thoại' : 'Luyện nói'}
        </h1>
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {serviceState && !serviceState.available && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <strong>Dịch vụ chấm phát âm chưa chạy.</strong> Trong thư mục train-Ai, chạy:
            <code className="block mt-2 bg-slate-900 text-slate-100 rounded-lg px-3 py-2 text-xs">
              .venv/Scripts/python -X utf8 -u serve.py --warm
            </code>
          </div>
        )}

        {loading && <p className="text-sm text-slate-500">Đang tải...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && sentences.length === 0 && (
          <p className="text-sm text-slate-500">
            Bài này không có câu nào để đọc to. Nếu đây là đề nói tự do của VSTEP
            thì nó không dùng model chấm phát âm.
          </p>
        )}

        {!loading && !error && sentences.length > 0 && (
          <>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
              <div className={isDialogue ? 'text-center' : ''}>
                <h2 className="text-xl font-bold text-slate-900">{exercise.title}</h2>
              </div>

              {/* ================= TIẾNG NHẬT: HỘI THOẠI =================
                  Trình bày như trang giáo trình: cột trái là tên vai kèm
                  dấu "：", cột phải là lời thoại; lời dài xuống dòng vẫn thẳng
                  hàng với cột lời. Bấm vào lượt đã chấm để xem chi tiết. */}
              {isDialogue && (
                <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-lg leading-loose text-slate-900">
                  {lines.map((l, i) => {
                    const r = turnResults[i];
                    const err = turnErrors[i];
                    const skipped = !recording && turnSkipped[i];
                    // Các CHỖ lệch (phần của cụm chứa âm sai), không phải số cụm
                    // bị cờ — xem `flaggedSpans`. Nhãn và chữ đỏ đếm cùng một thứ.
                    const flagged = flaggedSpans(l.text, r?.words);
                    const reading = activeTurn === i;
                    const judging = scoringTurn === i;
                    const open = openTurn === i && (r || err);
                    const rowTone = reading
                      ? 'bg-teal-50'
                      : judging
                        ? 'bg-slate-100'
                        : '';
                    return (
                      <div key={i} className="contents">
                        <div className={`rounded-l-lg pl-2 py-0.5 whitespace-nowrap text-slate-700 ${rowTone}`}>
                          {l.speaker
                            ? <>{renderJaLine(l.speaker, furigana.speakers[i])}：</>
                            : ''}
                        </div>
                        <div
                          role={r || err ? 'button' : undefined}
                          onClick={() => (r || err) && setOpenTurn(open ? null : i)}
                          className={`rounded-r-lg pr-2 py-0.5 ${rowTone} ${
                            r || err ? 'cursor-pointer hover:bg-slate-50' : ''
                          }`}
                        >
                          <span className="inline-flex items-baseline gap-2 flex-wrap">
                            <span className={skipped ? 'text-slate-400' : ''}>
                              {renderJaLine(l.text, furigana.lines[i], r?.words || [], readTo(i))}
                            </span>
                            {skipped && (
                              <span className="text-[11px] font-semibold px-1.5 rounded-full self-center leading-5 bg-slate-100 text-slate-500">
                                {skipped === 'đọc dở' ? 'Đọc dở · không chấm' : 'Chưa đọc'}
                              </span>
                            )}
                            {judging && (
                              <Loader2 className="w-4 h-4 text-slate-400 animate-spin self-center" />
                            )}
                            {r && (
                              <span
                                className={`text-[11px] font-semibold px-1.5 rounded-full self-center leading-5 ${
                                  flagged.length
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {flagged.length ? `${spanCount(flagged)} cần luyện` : 'Đạt'}
                              </span>
                            )}
                            {err && (
                              <span className="text-[11px] font-semibold px-1.5 rounded-full self-center leading-5 bg-red-100 text-red-700">
                                Lỗi chấm
                              </span>
                            )}
                          </span>
                          {/* KHÔNG hiện `l.gloss` (romaji): đây là bài luyện nói,
                              có sẵn romaji là có sẵn cách đọc. Furigana đã đủ. */}
                        </div>

                        {open && (
                          <div className="col-start-2 mb-2 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-base leading-normal">
                            {err && <p className="text-xs text-red-600">{err}</p>}
                            {r && (
                              <>
                                {flagged.length > 0 ? (
                                  <div>
                                    <p className="text-xs font-semibold text-amber-800 mb-1.5">
                                      Câu này có {spanCount(flagged)} đọc chưa chuẩn:
                                    </p>
                                    <WordChips words={flagged} />
                                  </div>
                                ) : (
                                  <p className="text-xs text-emerald-700 font-medium">
                                    Câu này bạn đọc tốt.
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ================= TIẾNG ANH: ĐOẠN VĂN ================= */}
              {!isDialogue && (
                <p className="text-lg leading-relaxed text-slate-800">
                  {sentences.map((text, i) => {
                    // Từ model chấm sai -> chữ đỏ, từ đúng để nguyên màu, từ
                    // chưa đọc tới (lúc đang ghi) -> chữ xám. Kết quả chấm cả
                    // bài (`byIndex`) thay kết quả chấm từng câu (`liveEn`).
                    const s = byIndex.get(i);
                    const bad = new Set((s ? s.practice_words || [] : liveEn[i] || []).map(normWord));
                    // Câu người học không đọc (hoặc đọc dở) khi bấm dừng:
                    // không chấm, hiện xám cả câu.
                    const unread = !recording && s
                      && (s.read_state === 'chưa đọc' || s.read_state === 'đọc dở');
                    const until = unread ? 0 : readTo(i);
                    let off = 0;
                    return (
                      <span key={i}>
                        {text.split(/(\s+)/).map((tok, j) => {
                          const at = off;
                          off += tok.length;
                          const cls = bad.has(normWord(tok)) ? 'text-red-600'
                            : at >= until ? 'text-slate-400' : '';
                          return cls ? <span key={j} className={cls}>{tok}</span> : tok;
                        })}{' '}
                      </span>
                    );
                  })}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
                {!isDialogue && !recording && !scoring && (
                  <button
                    onClick={() => startRecording(scorePassage)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-teal-700 text-white font-semibold text-sm hover:bg-teal-800"
                  >
                    <Mic className="w-4 h-4" /> Đọc cả đoạn
                  </button>
                )}
                {!isDialogue && recording && (
                  <button
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-600 text-white font-semibold text-sm hover:bg-red-700 animate-pulse"
                  >
                    <Square className="w-4 h-4" /> Dừng và chấm
                  </button>
                )}
                {!isDialogue && scoring && (
                  <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang chấm {sentences.length} câu... {elapsed}s
                    <span className="text-xs text-slate-400">
                      (chạy trên CPU, đừng tắt cửa sổ)
                    </span>
                  </span>
                )}
                {!isDialogue && result && !busy && (
                  <button
                    onClick={() => { setResult(null); setScoreError(''); }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200"
                  >
                    <RotateCcw className="w-4 h-4" /> Đọc lại
                  </button>
                )}
                {/* Hai cách đọc hội thoại. Mặc định là đọc một lèo, giống
                    hẳn tiếng Anh: một bản ghi, không bấm gì giữa các lượt. */}
                {isDialogue && !recording && !scoring && (
                  <>
                    <button
                      onClick={() => {
                        setOneShot(true);
                        setResult(null);
                        setTurnResults({});
                        setTurnErrors({});
                        setTurnSkipped({});
                        setOpenTurn(null);
                        startRecording(scorePassageJa);
                      }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-teal-700 text-white font-semibold text-sm hover:bg-teal-800"
                    >
                      {scoredCount > 0
                        ? <><RotateCcw className="w-4 h-4" /> Đọc lại một lèo</>
                        : <><Mic className="w-4 h-4" /> Đọc một lèo cả hội thoại</>}
                    </button>
                    <button
                      onClick={() => { setOneShot(false); setResult(null); startDialogue(); }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200"
                    >
                      <ChevronRight className="w-4 h-4" /> Đọc theo từng lượt
                    </button>
                  </>
                )}
                {isDialogue && recording && oneShot && (
                  <>
                    <button
                      onClick={stopRecording}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-600 text-white font-semibold text-sm hover:bg-red-700 animate-pulse"
                    >
                      <Square className="w-4 h-4" /> Dừng và chấm
                    </button>
                    <span className="text-xs text-slate-500">
                      Đọc liền cả {lines.length} lượt, không cần bấm gì giữa các lượt
                    </span>
                  </>
                )}
                {isDialogue && recording && !oneShot && (
                  <>
                    <button
                      onClick={advanceDialogue}
                      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-semibold text-sm animate-pulse ${
                        isLastTurn ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-700 hover:bg-teal-800'
                      }`}
                    >
                      {isLastTurn
                        ? <><Square className="w-4 h-4" /> Dừng và chấm</>
                        : <><ChevronRight className="w-4 h-4" /> Câu tiếp</>}
                    </button>
                    <span className="text-xs text-slate-500">
                      Đang đọc lượt {activeTurn + 1}/{lines.length} · phím
                      <kbd className="mx-1 px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 text-[10px] font-mono">Space</kbd>
                      để sang câu
                    </span>
                    <button
                      onClick={cancelDialogue}
                      className="text-xs text-slate-400 hover:text-slate-600 underline"
                    >
                      Huỷ
                    </button>
                  </>
                )}
                {isDialogue && scoring && (
                  <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {oneShot
                      ? `Đang cắt và chấm ${lines.length} lượt... ${elapsed}s`
                      : `Đang chấm lượt ${(scoringTurn ?? 0) + 1}/${lines.length}... ${elapsed}s`}
                    <span className="text-xs text-slate-400">
                      (chạy trên CPU, đừng tắt cửa sổ)
                    </span>
                  </span>
                )}
                {!busy && (
                  <span className="text-xs text-slate-400">
                    {isDialogue
                      ? `${lines.length} lượt${scoredCount ? ` · đã chấm ${scoredCount}` : ''}`
                      : `${sentences.length} câu`}
                  </span>
                )}
              </div>

              {recording && liveStatus && (
                <p className={`text-xs ${
                  liveStatus.state === 'failed' ? 'text-amber-700'
                    : liveStatus.state === 'retrying' ? 'text-amber-600' : 'text-slate-500'
                }`}
                >
                  {liveStatus.state === 'opening' && 'Đang mở phiên chấm trực tiếp...'}
                  {liveStatus.state === 'live' && (
                    <>
                      Đang chấm trực tiếp
                      {typeof liveStatus.lagSec === 'number' && (
                        <> · chữ trễ <b className="tabular-nums">{liveStatus.lagSec.toFixed(1)} s</b> so với lời nói</>
                      )}
                      {typeof liveStatus.modelSec === 'number' && (
                        <span className="text-slate-400 tabular-nums">
                          {' '}(model {liveStatus.modelSec.toFixed(2)} s · cả lượt {liveStatus.roundTripSec.toFixed(2)} s)
                        </span>
                      )}
                    </>
                  )}
                  {liveStatus.state === 'retrying' && `${liveStatus.message}...`}
                  {liveStatus.state === 'failed'
                    && `${liveStatus.message}. Bạn cứ đọc tiếp — bấm Dừng thì cả bài vẫn được chấm.`}
                </p>
              )}

              {recording && !liveStatus && !liveTrackingSupported && (
                <p className="text-xs text-slate-400">
                  Trình duyệt này không hiện được chỗ bạn đang đọc (cần Chrome hoặc Edge).
                  Ghi âm và chấm điểm vẫn chạy bình thường.
                </p>
              )}

              {scoreError && <p className="text-sm text-red-600">{scoreError}</p>}

              {isDialogue && (
                <p className="text-xs text-slate-400 leading-snug border-t border-slate-100 pt-3">
                  Kết quả do máy chấm tự động, so với cách đọc của người Nhật. Chỉ để bạn tham khảo khi luyện tập.
                </p>
              )}
            </div>

            {isDialogue && result?.sentences && <JaResultCard result={result} />}

            {/* ----- KẾT QUẢ CẢ ĐOẠN (chỉ tiếng Anh) ----- */}
            {result?.utterance && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                <h3 className="font-bold text-slate-900">
                  Kết quả
                </h3>
                {typeof result.sentences_read === 'number'
                  && result.sentences_read < result.sentences_total && (
                  <p className="text-xs text-slate-500">
                    Bạn dừng ở câu {result.sentences_read + 1}. Câu đọc dở và các câu chưa đọc
                    (chữ xám) không được chấm.
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {UTT_LABELS.map(([key, label]) => {
                    const c = result.utterance[key];
                    return (
                      <div key={key} className="rounded-xl bg-slate-50 p-4 text-center">
                        <p className="text-xs text-slate-500 font-medium">{label}</p>
                        <p className="text-2xl font-bold text-slate-900 mt-1">
                          {c ? c.score : '—'}
                        </p>
                        {c?.band && <p className="text-[11px] text-slate-400">{c.band}</p>}
                      </div>
                    );
                  })}
                </div>

                {practiceWords.length > 0 ? (
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-2">
                      Từ cần luyện ({practiceWords.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {practiceWords.map((w, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-emerald-700">
                    Không có từ nào bị đánh dấu cần luyện.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default SpeakingPracticePage;
