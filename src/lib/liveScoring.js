/**
 * CHẤM TRỰC TIẾP: đẩy âm thanh lên model của đồ án TRONG LÚC người học đọc.
 *
 * VÌ SAO THAY `liveReading.js` Ở CHẾ ĐỘ ĐỌC MỘT LÈO. Bản cũ để Web Speech API
 * của trình duyệt quyết định khi nào xong một câu rồi mới gửi câu đó đi chấm.
 * Web Speech nghe lệch (kana chỗ kanji), rớt mạng, hay Chrome tự ngắt phiên là
 * con trỏ đứng, câu không bao giờ được cắt, và màn hình "đứng hình" tới lúc bấm
 * dừng. Ở đây MODEL tự biết người học đọc tới đâu (train-Ai/src/stream.py);
 * trình duyệt chỉ thu âm và gửi đi. Không còn phụ thuộc dịch vụ nhận dạng nào.
 *
 * NHỊP GỬI TỰ ĐIỀU CHỈNH. Lượt sau chỉ gửi khi lượt trước đã có kết quả, và
 * không sớm hơn `minIntervalMs`. Máy chậm thì khúc tự to ra, chữ chậm lại một
 * nhịp chứ không dồn hàng chờ. Đo ở bước 66 (CPU 4 luồng): tiếng Nhật trung vị
 * 0,23 s mỗi lượt; tiếng Anh ~0,23 s mỗi lượt (bước 66, 30/10).
 *
 * KHÔNG MẤT ÂM KHI MẠNG LỖI. Khúc chỉ bị bỏ khỏi hàng đợi khi server xác nhận
 * đã nhận. Lỗi thì giữ nguyên và gửi lại kèm `offset`; server bỏ phần trùng.
 *
 * ⚠️ Kết quả ở đây là BẢN TẠM để hiện chữ. Bấm dừng thì trang vẫn chấm lại cả
 * bản ghi bằng /score-passage, và kết quả đó thay hết.
 */
import api from '../services/api';

const TARGET_RATE = 16000;

/*
 * NHẬT KÝ CHẨN ĐOÁN mở phiên (xem services/liveScoringLog.js phía server). Mỗi lần mở phiên lỗi / thử lại
 * được ghi vào localStorage rồi gửi về /pronunciation/client-log; gửi không được (chính lúc mất kết nối)
 * thì giữ lại, lần sau gửi bù. Chỉ thông tin kỹ thuật: giờ, mã lỗi, thời gian chờ, trạng thái mạng.
 */
const DIAG_KEY = 'liveScoringDiag';
function diagPush(entry) {
  try {
    const list = JSON.parse(localStorage.getItem(DIAG_KEY) || '[]');
    list.push({
      at: new Date().toISOString(),
      page: window.location.pathname,
      online: navigator.onLine,
      sinceLoadSec: Math.round(performance.now() / 100) / 10,
      ...entry
    });
    localStorage.setItem(DIAG_KEY, JSON.stringify(list.slice(-50)));
  } catch { /* localStorage đầy / bị chặn */ }
}
export async function flushLiveScoringDiag() {
  let list;
  try { list = JSON.parse(localStorage.getItem(DIAG_KEY) || '[]'); } catch { return; }
  if (!list.length) return;
  try {
    await api.post('/pronunciation/client-log', { entries: list }, { timeout: 10000 });
    // chỉ xoá đúng những dòng đã gửi (trong lúc gửi có thể có dòng mới)
    const now = JSON.parse(localStorage.getItem(DIAG_KEY) || '[]');
    localStorage.setItem(DIAG_KEY, JSON.stringify(now.slice(list.length)));
  } catch { /* để lần sau */ }
}

// Worklet gom ~2048 mẫu rồi mới gửi về luồng chính: gửi mỗi khối 128 mẫu là
// ~375 tin nhắn mỗi giây, tốn hơn chính việc thu âm.
const WORKLET_SRC = `
class PcmTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i += 1) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) {
          this.port.postMessage(this.buf.slice(0));
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-tap', PcmTap);
`;

/** Lấy mẫu lại theo luồng (nội suy tuyến tính), giữ trạng thái giữa các khối. */
class StreamResampler {
  constructor(from, to) {
    this.step = from / to;
    this.pos = 1; // vị trí trên dãy ảo [prev, ...khối]; 1 = mẫu đầu của khối đầu
    this.prev = 0;
  }

  process(x) {
    const n = x.length;
    if (!n) return new Float32Array(0);
    const out = new Float32Array(Math.ceil((n + 1 - this.pos) / this.step) + 1);
    let k = 0;
    let p = this.pos;
    while (p < n) {
      const i = Math.floor(p);
      const a = i === 0 ? this.prev : x[i - 1];
      const b = x[i];
      out[k++] = a + (b - a) * (p - i);
      p += this.step;
    }
    this.pos = p - n;
    this.prev = x[n - 1];
    return out.subarray(0, k);
  }
}

function toInt16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i += 1) {
    const v = Math.max(-1, Math.min(1, f32[i]));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

/**
 * Một lượt đọc có chấm trực tiếp.
 *
 *   onUpdate(view)   trạng thái mới nhất từ model (xem stream.py `view`)
 *   onStatus(s)      { state: 'opening'|'live'|'retrying'|'failed', message?, lagSec? }
 */
export class LiveScoringSession {
  constructor({ stream, sentences, lang, onUpdate, onStatus }) {
    this.stream = stream;
    this.sentences = sentences;
    this.lang = lang;
    this.onUpdate = onUpdate;
    this.onStatus = onStatus;
    // Tiếng Nhật: model nhỏ, bước 66 đo trung vị 0,17 s mỗi lượt (8 luồng)
    // nên gửi dày được. Tiếng Anh: WavLM-large, ~0,12 s cho mỗi giây âm thanh
    // tính từ đầu câu (câu 5 s ≈ 0,5 s/lượt). Trước đây để 1 s vì lượt chốt
    // câu chấm ngay trong lượt (3,3 s, phiên 29/10 16:28); giờ chấm ở luồng
    // nền nên 0,5 s — câu dài thì lượt chậm hơn, nhịp tự giãn theo.
    // 30/10: khoá phần đầu câu đã đọc (stream.py) đưa mỗi lượt về ~0,23 s;
    // mô phỏng thời gian thực trên phiên 16:22: 0,3 s cho chữ hiện sau trung
    // vị 0,49 s (0,5 s: 0,62 s). Nhịp vẫn tự giãn nếu lượt chậm hơn.
    this.minIntervalMs = 300;
    this.queue = []; // các khối Int16Array chưa được server xác nhận
    this.queued = 0;
    this.sent = 0; // số mẫu server đã xác nhận
    this.inflight = false;
    this.lastSend = 0;
    this.failures = 0;
    this.active = true;
    this.id = null;
  }

  async start() {
    this.onStatus?.({ state: 'opening' });
    // Thu âm NGAY, trước khi mở phiên xong: lượt mở đầu tiên có thể phải chờ
    // nạp model, và người học thường bắt đầu đọc ngay khi bấm.
    await this.startCapture();
    // Mở phiên CÓ THỬ LẠI. Trước đây chỉ thử một lần: một lỗi thoáng qua ngay sau khi khởi động
    // (mất kết nối qua proxy Vite, server Node / dịch vụ Python vừa lên, 502/503/504) làm mất chấm
    // trực tiếp cả lượt đọc — tải lại trang bấm lần hai thì lại chạy. Trong lúc thử lại micro vẫn
    // thu (hàng đợi giữ nguyên), mở được phiên là phần đã đọc được gửi bù, không mất chữ.
    const delays = [1000, 2000, 4000, 8000];
    flushLiveScoringDiag(); // gửi bù nhật ký của lần lỗi trước (nếu còn)
    for (let attempt = 0; ; attempt += 1) {
      let res;
      const tReq = Date.now();
      try {
        res = await api.post('/pronunciation/stream/open',
          { sentences: this.sentences, language: this.lang },
          { timeout: 120000 });
      } catch (err) {
        if (!this.active) return;
        const status = err?.response?.status;
        const serverMsg = err?.response?.data?.message;
        const transient = !status || status >= 500 || status === 429;
        const info = { attempt: attempt + 1, status, code: err?.code, message: serverMsg || err?.message, ms: Date.now() - tReq };
        // eslint-disable-next-line no-console
        console.warn('[chấm trực tiếp] mở phiên lỗi', info);
        diagPush({ kind: transient && attempt < delays.length ? 'open-failed-retrying' : 'open-gave-up', language: this.lang, ...info });
        if (transient && attempt < delays.length) {
          this.onStatus?.({
            state: 'retrying',
            message: `Chưa mở được phiên chấm trực tiếp, đang thử lại (lần ${attempt + 2}/${delays.length + 1})`,
            lagSec: this.queued / TARGET_RATE
          });
          await new Promise((r) => setTimeout(r, delays[attempt]));
          if (!this.active) return;
          continue;
        }
        const why = serverMsg
          || (status ? `máy chủ trả lỗi ${status}` : `không kết nối được tới máy chủ${err?.code ? ` (${err.code})` : ''}`);
        this.fail(`Không mở được phiên chấm trực tiếp: ${why}`);
        flushLiveScoringDiag();
        return;
      }
      if (!this.active) {
        this.closeRemote(res.data?.session_id);
        return;
      }
      this.id = res.data?.session_id;
      if (attempt > 0) {
        // mở được sau khi thử lại: ghi lại để biết lỗi thoáng qua kéo dài bao lâu
        diagPush({ kind: 'open-recovered', attempt: attempt + 1, language: this.lang, ms: Date.now() - tReq });
        flushLiveScoringDiag();
      }
      // Lỗi khi vẽ kết quả đầu tiên KHÔNG được coi là "không mở được phiên" (phiên đã mở rồi).
      try { this.onUpdate?.(res.data); } catch (e) { console.error('[chấm trực tiếp] lỗi hiển thị', e); } // eslint-disable-line no-console
      this.onStatus?.({ state: 'live', lagSec: 0 });
      this.timer = setInterval(() => this.pump(), 100);
      return;
    }
  }

  async startCapture() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => { });
    this.resampler = new StreamResampler(this.ctx.sampleRate, TARGET_RATE);
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.mute = this.ctx.createGain();
    this.mute.gain.value = 0;
    const onPcm = (f32) => {
      if (!this.active) return;
      // Mốc thời gian của mẫu ĐẦU TIÊN, để tính "chữ trễ bao lâu so với lời".
      if (this.t0 === undefined) {
        this.t0 = performance.now() - (f32.length / this.ctx.sampleRate) * 1000;
      }
      const pcm = toInt16(this.resampler.process(f32));
      if (pcm.length) {
        this.queue.push(pcm);
        this.queued += pcm.length;
      }
    };
    // AudioWorklet chạy trên luồng âm thanh riêng: React vẽ lại giao diện
    // không làm rơi mẫu. ScriptProcessor chỉ là đường lùi cho trình duyệt cũ.
    if (this.ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'text/javascript' }));
      try {
        await this.ctx.audioWorklet.addModule(url);
        this.node = new AudioWorkletNode(this.ctx, 'pcm-tap');
        this.node.port.onmessage = (e) => onPcm(e.data);
      } finally {
        URL.revokeObjectURL(url);
      }
    } else {
      this.node = this.ctx.createScriptProcessor(4096, 1, 1);
      this.node.onaudioprocess = (e) => onPcm(new Float32Array(e.inputBuffer.getChannelData(0)));
    }
    this.source.connect(this.node);
    this.node.connect(this.mute);
    this.mute.connect(this.ctx.destination);
  }

  pump() {
    if (!this.active || !this.id || this.inflight || !this.queued) return;
    const now = Date.now();
    const backoff = this.failures ? Math.min(4000, 500 * 2 ** (this.failures - 1)) : 0;
    if (now - this.lastSend < Math.max(this.minIntervalMs, backoff)) return;
    this.send();
  }

  async send() {
    this.inflight = true;
    this.lastSend = Date.now();
    const n = this.queue.length;
    const body = new Int16Array(this.queued);
    let off = 0;
    for (let i = 0; i < n; i += 1) {
      body.set(this.queue[i], off);
      off += this.queue[i].length;
    }
    try {
      const res = await api.post(
        `/pronunciation/stream/${this.id}/push?offset=${this.sent}`,
        body.buffer,
        { headers: { 'Content-Type': 'application/octet-stream' }, timeout: 30000 }
      );
      if (!this.active) return;
      this.queue.splice(0, n);
      this.queued -= body.length;
      this.sent += body.length;
      if (this.failures > 0) {
        diagPush({ kind: 'push-recovered', attempt: this.failures + 1, language: this.lang });
        flushLiveScoringDiag();
      }
      this.failures = 0;
      this.onUpdate?.(res.data);
      // Độ trễ người học THẤY: thời gian thật đã trôi kể từ mẫu đầu tiên, trừ
      // lượng âm thanh model đã nghe. Gồm cả chờ nhịp gửi, mạng và model.
      const lagSec = this.t0 === undefined ? 0
        : Math.max(0, (performance.now() - this.t0) / 1000 - this.sent / TARGET_RATE);
      this.onStatus?.({
        state: 'live',
        lagSec,
        modelSec: res.data?.elapsed,
        roundTripSec: (Date.now() - this.lastSend) / 1000
      });
    } catch (err) {
      if (!this.active) return;
      const status = err?.response?.status;
      const expected = err?.response?.data?.expected_offset;
      if (status === 409 && Number.isFinite(expected) && expected >= this.sent) {
        // Server đã có sẵn một phần (lượt trước hết giờ nhưng thật ra đã nhận):
        // bỏ phần đó khỏi hàng đợi rồi gửi tiếp phần còn lại.
        this.dropFront(expected - this.sent);
        this.sent = expected;
      } else if (status === 404 || status === 400 || status === 409) {
        this.fail(err?.response?.data?.message || 'Phiên chấm trực tiếp đã kết thúc');
      } else {
        this.failures += 1;
        // nhật ký: chỉ lần lỗi ĐẦU của mỗi đợt mất kết nối (lượt gửi rất dày)
        if (this.failures === 1) {
          diagPush({ kind: 'push-failed', status, code: err?.code, message: err?.response?.data?.message || err?.message, language: this.lang });
        }
        this.onStatus?.({
          state: 'retrying',
          message: err?.response?.data?.message || 'Mất kết nối tới dịch vụ chấm, đang thử lại',
          lagSec: this.queued / TARGET_RATE
        });
      }
    } finally {
      this.inflight = false;
    }
  }

  dropFront(k) {
    let left = k;
    while (left > 0 && this.queue.length) {
      const c = this.queue[0];
      if (c.length <= left) {
        this.queue.shift();
        left -= c.length;
        this.queued -= c.length;
      } else {
        this.queue[0] = c.subarray(left);
        this.queued -= left;
        left = 0;
      }
    }
  }

  /** Lỗi không gỡ được: dừng chấm trực tiếp, nhưng bản ghi vẫn chấm khi bấm dừng. */
  fail(message) {
    this.onStatus?.({ state: 'failed', message });
    this.stopLocal();
  }

  closeRemote(id) {
    if (id) api.delete(`/pronunciation/stream/${id}`).catch(() => { });
  }

  stopLocal() {
    this.active = false;
    clearInterval(this.timer);
    try {
      this.source?.disconnect();
      this.node?.disconnect();
      this.mute?.disconnect();
    } catch { /* đã ngắt */ }
    this.ctx?.close().catch(() => { });
  }

  stop() {
    this.stopLocal();
    this.closeRemote(this.id);
    this.id = null;
  }
}

/**
 * Tiếng Anh: số ký tự đã đọc của câu, từ số từ model đã nghe xong.
 * Từ của model khớp với các cụm cách nhau bởi dấu cách của câu gốc.
 */
export function enReadChars(text, nWords) {
  if (nWords <= 0) return 0;
  const re = /\S+/g;
  let m;
  let k = 0;
  while ((m = re.exec(text))) {
    k += 1;
    if (k === nWords) return m.index + m[0].length;
  }
  return text.length;
}
