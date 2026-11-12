/**
 * Theo dõi người học ĐANG ĐỌC TỚI ĐÂU, và cắt bản ghi ở ranh giới câu để
 * model của đồ án chấm từng câu ngay khi đọc xong.
 *
 * ⚠️ PHÂN VAI — đừng trộn:
 *   - Web Speech API của trình duyệt CHỈ dùng để biết vị trí đang đọc (chữ
 *     chưa đọc xám, đã đọc đen) và lúc nào xong một câu. Nó KHÔNG chấm: nó
 *     nghe ra chữ, không biết phát âm chuẩn hay không. Kết quả của nó không
 *     được gửi đi đâu và không quyết định màu đỏ.
 *   - ĐÚNG/SAI (chữ đỏ) chỉ đến từ model của đồ án, qua /pronunciation/score.
 *
 * Trình duyệt không có Web Speech API (Firefox, Safari cũ) thì vị trí đọc
 * không chạy, nhưng việc ghi âm và chấm vẫn như thường.
 */

const SpeechRecognition = typeof window !== 'undefined'
  && (window.SpeechRecognition || window.webkitSpeechRecognition);

export const liveTrackingSupported = Boolean(SpeechRecognition);

// ---------- Đơn vị để dò vị trí ----------

const PUNCT_RE = /[\s\p{P}\p{S}]/u;

export function normWord(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
}

/**
 * Chia các câu thành đơn vị dò: tiếng Anh theo TỪ, tiếng Nhật theo KÝ TỰ
 * (tiếng Nhật không có dấu cách). Mỗi đơn vị nhớ câu và vị trí ký tự của nó.
 */
export function buildUnits(sentences, lang) {
  const units = [];
  const firstOf = [];
  sentences.forEach((text, s) => {
    firstOf[s] = units.length;
    if (lang === 'ja') {
      [...text].forEach((ch, idx) => {
        if (!PUNCT_RE.test(ch)) units.push({ s, key: ch, end: idx + 1 });
      });
    } else {
      const re = /\S+/g;
      let m;
      while ((m = re.exec(text))) {
        const key = normWord(m[0]);
        if (key) units.push({ s, key, end: m.index + m[0].length });
      }
    }
  });
  firstOf[sentences.length] = units.length;
  return { units, firstOf };
}

/**
 * Khớp chuỗi trình duyệt nghe được vào bài, tham lam từ trái sang phải trong
 * một cửa sổ nhỏ phía trước. Trả số đơn vị đã đọc qua.
 *
 * Tiếng Nhật: trình duyệt có thể viết kana chỗ bài viết kanji (hoặc ngược
 * lại), nên cứ 3 ký tự không khớp liên tiếp thì coi như đã đọc thêm 1 ký tự —
 * để vị trí không đứng im mãi.
 */
export function matchProgress(heard, units, lang, from = 0) {
  const tokens = lang === 'ja'
    ? [...heard].filter((ch) => !PUNCT_RE.test(ch))
    : heard.split(/\s+/).map(normWord).filter(Boolean);
  const WINDOW = lang === 'ja' ? 6 : 4;
  let ptr = from;
  let miss = 0;
  for (const t of tokens) {
    let found = -1;
    for (let k = ptr; k < Math.min(units.length, ptr + WINDOW); k += 1) {
      if (units[k].key === t) { found = k; break; }
    }
    if (found >= 0) {
      ptr = found + 1;
      miss = 0;
    } else if (lang === 'ja' && ++miss >= 3 && ptr < units.length) {
      ptr += 1;
      miss = 0;
    }
  }
  return ptr;
}

// ---------- Thu âm PCM để cắt được ở chỗ ngắt nghỉ ----------

const TARGET_RATE = 16000;
const FRAME_SEC = 0.02;

/**
 * Thu PCM song song với MediaRecorder. Cần PCM vì webm của MediaRecorder không
 * cắt được ở giữa (chỉ khúc đầu có header), mà ta cần cắt đúng chỗ im lặng
 * giữa hai câu.
 */
export class PcmRecorder {
  constructor(stream) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.rate = this.ctx.sampleRate;
    this.chunks = [];
    this.length = 0;
    this.energy = []; // năng lượng theo khung 20 ms, để tìm chỗ im lặng
    this.frameLen = Math.round(this.rate * FRAME_SEC);
    this.acc = 0;
    this.accN = 0;

    this.source = this.ctx.createMediaStreamSource(stream);
    this.proc = this.ctx.createScriptProcessor(4096, 1, 1);
    this.mute = this.ctx.createGain();
    this.mute.gain.value = 0;
    this.proc.onaudioprocess = (e) => {
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      this.chunks.push(data);
      this.length += data.length;
      for (let i = 0; i < data.length; i += 1) {
        this.acc += data[i] * data[i];
        this.accN += 1;
        if (this.accN === this.frameLen) {
          this.energy.push(this.acc / this.accN);
          this.acc = 0;
          this.accN = 0;
        }
      }
    };
    this.source.connect(this.proc);
    this.proc.connect(this.mute);
    this.mute.connect(this.ctx.destination);
  }

  get now() { return this.length; }

  /**
   * Chỗ cắt tốt nhất trong [lo, hi] (đơn vị mẫu): giữa đoạn 200 ms im nhất.
   */
  findQuietCut(lo, hi) {
    const f0 = Math.max(0, Math.floor(lo / this.frameLen));
    const f1 = Math.min(this.energy.length, Math.floor(hi / this.frameLen));
    const W = 10;
    if (f1 - f0 <= W) return hi;
    let best = f0;
    let bestE = Infinity;
    let sum = 0;
    for (let f = f0; f < f1; f += 1) {
      sum += this.energy[f];
      if (f - f0 >= W) sum -= this.energy[f - W];
      if (f - f0 >= W - 1 && sum < bestE) {
        bestE = sum;
        best = f - Math.floor(W / 2);
      }
    }
    return best * this.frameLen;
  }

  /** Lấy mẫu [a, b) và đóng gói WAV 16 kHz mono. */
  sliceWav(a, b) {
    const out = new Float32Array(Math.max(0, b - a));
    let pos = 0;
    let off = 0;
    for (const c of this.chunks) {
      const cEnd = pos + c.length;
      if (cEnd > a && pos < b) {
        const s = Math.max(a, pos) - pos;
        const e = Math.min(b, cEnd) - pos;
        out.set(c.subarray(s, e), off);
        off += e - s;
      }
      pos = cEnd;
      if (pos >= b) break;
    }
    return encodeWav(resample(out, this.rate, TARGET_RATE), TARGET_RATE);
  }

  close() {
    try { this.proc.disconnect(); this.source.disconnect(); this.mute.disconnect(); } catch { /* đã ngắt */ }
    this.ctx.close().catch(() => { });
  }
}

function resample(data, from, to) {
  if (from === to) return data;
  const ratio = from / to;
  const n = Math.floor(data.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, data.length - 1);
    out[i] = data[i0] + (data[i1] - data[i0]) * (x - i0);
  }
  return out;
}

function encodeWav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i += 1) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

// ---------- Phiên theo dõi ----------

/**
 * Một lượt đọc. `onProgress(ptr)` báo số đơn vị đã đọc; `onSentence(i, wav)`
 * gọi khi đã đọc xong câu i (chỉ khi `autoCut`), kèm đoạn âm thanh của câu đó.
 */
export class LiveReadingSession {
  constructor({ stream, sentences, lang, autoCut, onProgress, onSentence }) {
    this.lang = lang;
    this.sentences = sentences;
    const { units, firstOf } = buildUnits(sentences, lang);
    this.units = units;
    this.firstOf = firstOf;
    this.onProgress = onProgress;
    this.onSentence = onSentence;
    this.autoCut = autoCut;
    this.ptr = 0;
    this.base = 0; // vị trí bắt đầu khớp của phiên nhận dạng hiện tại
    this.committed = '';
    this.sessionText = '';
    this.nextSentence = 0; // câu kế tiếp chưa cắt
    this.lastCut = 0;
    this.timers = [];
    this.active = true;

    this.pcm = autoCut ? new PcmRecorder(stream) : null;
    if (SpeechRecognition) this.startRecognition();
  }

  startRecognition() {
    const rec = new SpeechRecognition();
    rec.lang = this.lang === 'ja' ? 'ja-JP' : 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i += 1) text += `${e.results[i][0].transcript} `;
      this.sessionText = text;
      this.update();
    };
    // Chrome tự ngắt sau một lúc im lặng hoặc khi rớt mạng; đang đọc thì bật
    // lại, giữ phần đã nghe. Gọi `start()` ngay trong `onend` đôi khi bị Chrome
    // bỏ qua mà không báo gì — con trỏ đứng luôn từ đó. Chờ một nhịp rồi mới
    // bật, và thử lại nếu vẫn hỏng.
    rec.onend = () => {
      this.committed += ` ${this.sessionText}`;
      this.sessionText = '';
      this.restart(rec, 250);
    };
    rec.onerror = (e) => {
      // Bị chặn quyền thì bật lại cũng vô ích.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.blocked = true;
      }
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('Web Speech:', e.error);
      }
    };
    this.rec = rec;
    try { rec.start(); } catch { /* bỏ qua */ }
  }

  restart(rec, delay) {
    if (!this.active || this.blocked) return;
    const t = setTimeout(() => {
      if (!this.active) return;
      try {
        rec.start();
      } catch {
        this.restart(rec, Math.min(delay * 2, 2000));
      }
    }, delay);
    this.timers.push(t);
  }

  update() {
    const p = matchProgress(`${this.committed} ${this.sessionText}`, this.units, this.lang, this.base);
    // Chỉ tiến, không lùi: kết quả tạm của trình duyệt hay tự sửa lại.
    if (p > this.ptr) {
      this.ptr = p;
      this.onProgress?.(this.ptr);
    }
    if (this.autoCut) this.checkSentenceEnd();
  }

  /** Đọc hết câu i (hoặc đã sang câu sau) -> cắt câu i sau 0,7 s. */
  checkSentenceEnd() {
    const i = this.nextSentence;
    if (i >= this.sentences.length - 1) return; // câu cuối: chấm khi bấm dừng
    if (this.ptr < this.firstOf[i + 1]) return;
    this.nextSentence = i + 1;
    const t = setTimeout(() => this.cut(i), 700);
    this.timers.push(t);
  }

  cut(i) {
    if (!this.active || !this.pcm) return;
    const now = this.pcm.now;
    const lo = Math.max(this.lastCut + this.pcm.rate * 0.5, now - this.pcm.rate * 3);
    const at = this.pcm.findQuietCut(lo, now);
    const wav = this.pcm.sliceWav(this.lastCut, at);
    this.lastCut = at;
    this.onSentence?.(i, wav);
  }

  /** Chế độ đọc từng lượt: người học bấm sang câu i thì vị trí nhảy tới đó. */
  jumpTo(i) {
    const p = this.firstOf[i] ?? this.ptr;
    if (p > this.ptr) {
      this.ptr = p;
      this.onProgress?.(this.ptr);
    }
    // Khớp tiếp từ đầu câu i, bỏ phần đã nghe trước đó.
    this.base = this.ptr;
    this.committed = '';
    this.sessionText = '';
    try { this.rec?.abort(); } catch { /* bỏ qua */ }
  }

  /** Số ký tự đã đọc của câu s. */
  readChars(s) {
    if (this.ptr >= this.firstOf[s + 1]) return Infinity;
    if (this.ptr <= this.firstOf[s]) return 0;
    return this.units[this.ptr - 1].end;
  }

  stop() {
    this.active = false;
    this.timers.forEach(clearTimeout);
    try { this.rec?.stop(); } catch { /* bỏ qua */ }
    this.pcm?.close();
  }
}
