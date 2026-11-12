/**
 * Cầu nối sang dịch vụ chấm phát âm bằng model của đồ án (Python).
 *
 * CHƯA ÁP DỤNG vào dự án web — xem README.md cùng thư mục.
 * Khi gắn: chép file này vào `ai_languages_learn/services/`.
 *
 * VÌ SAO LÀ DỊCH VỤ RIÊNG, KHÔNG PHẢI FILE MODEL NHÚNG VÀO NODE.
 * Model chạy trên PyTorch; backbone nặng 2,8 GB. Node không chạy được PyTorch,
 * nên không tồn tại "một file model" để import vào đây. Kiến trúc đúng:
 *
 *     trình duyệt -> Express (cổng 5000) -> dịch vụ Python (cổng 8000)
 *
 * KHÁC GÌ `aiService.gradeSpeechWithAI`: hàm đó gửi âm thanh cho Gemini chấm
 * câu nói TỰ DO theo thang VSTEP. Đường này đối chiếu với VĂN BẢN MẪU đã biết
 * trước, bằng model của đồ án. Hai câu hỏi khác nhau — nên để song song.
 *
 * HAI NGÔN NGỮ KHÔNG ĐỐI XỨNG, giao diện phải đọc cờ `available`:
 *   tiếng Anh   model ĐÃ TRAIN trên nhãn người chấm -> có 4 điểm cấp câu
 *   tiếng Nhật  model âm vị CÓ SẴN, đóng băng; phần của đồ án là PHƯƠNG PHÁP
 *               -> KHÔNG có điểm cấp câu (không tồn tại nhãn người chấm)
 * Thứ cùng hình dạng ở cả hai bên là `criteria` với bốn khoá.
 */

import fs from 'fs';
import path from 'path';

const BASE_URL = (process.env.PRONUNCIATION_SERVICE_URL || 'http://127.0.0.1:8000')
  .replace(/\/+$/, '');

// Lượt gọi ĐẦU phải chờ nạp model (~12 s tiếng Anh, ~4 s tiếng Nhật). Các lượt
// sau: ~4 s tiếng Anh, ~1 s tiếng Nhật. Chạy serve.py --warm thì lượt đầu nhanh.
const TIMEOUT_MS = Number(process.env.PRONUNCIATION_TIMEOUT_MS || 180000);

const SUPPORTED = new Set(['en', 'ja']);

function withTimeout(ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, done: () => clearTimeout(timer) };
}

/** Dịch vụ có sống không, và đã nạp ngôn ngữ nào. */
export async function checkPronunciationService() {
  const t = withTimeout(5000);
  try {
    const r = await fetch(`${BASE_URL}/health`, { signal: t.signal });
    if (!r.ok) return { available: false, reason: `HTTP ${r.status}` };
    return { available: true, ...(await r.json()) };
  } catch (err) {
    return {
      available: false,
      reason: err.name === 'AbortError' ? 'timeout' : err.message,
      hint: 'Chạy trong train-Ai: .venv/Scripts/python -X utf8 -u serve.py --warm'
    };
  } finally {
    t.done();
  }
}

/**
 * 42 câu tiếng Nhật chấm được NGỮ ĐIỆU CẢ CÂU.
 *
 * Ràng buộc THẬT, không phải hạn chế tạm: phép đo cần mốc của >= 6 người bản
 * ngữ đọc CHÍNH câu đó, và chỉ 42 câu của KANI có mốc. Câu ngoài danh sách vẫn
 * chấm được ba tiêu chí kia; `criteria.intonation.available` sẽ là false kèm
 * lý do — giao diện nên ẩn ô đó chứ đừng hiện 0 điểm.
 */
export async function listJapaneseProsodySentences() {
  const t = withTimeout(15000);
  try {
    const r = await fetch(`${BASE_URL}/ja/sentences`, { signal: t.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    t.done();
  }
}

/**
 * Chấm một bản ghi đọc theo văn bản mẫu.
 *
 * @param {object}  opts
 * @param {string}  opts.audioPath  đường dẫn file tạm (multer)
 * @param {string}  opts.text       văn bản mẫu người học được yêu cầu đọc
 * @param {string}  opts.language   'en' | 'ja'
 * @param {string} [opts.mimeType]
 */
export async function scorePronunciation({ audioPath, text, language, mimeType }) {
  const lang = String(language || 'en').trim().toLowerCase().slice(0, 2);
  if (!SUPPORTED.has(lang)) {
    const e = new Error(`Ngôn ngữ chưa hỗ trợ: ${language}`);
    e.statusCode = 400;
    throw e;
  }
  const target = String(text || '').trim();
  if (!target) {
    const e = new Error('Thiếu văn bản mẫu để đối chiếu');
    e.statusCode = 400;
    throw e;
  }
  if (!audioPath || !fs.existsSync(audioPath)) {
    const e = new Error('Không tìm thấy file âm thanh');
    e.statusCode = 400;
    throw e;
  }

  const buf = await fs.promises.readFile(audioPath);
  const form = new FormData();
  form.append('audio', new Blob([buf], { type: mimeType || 'audio/webm' }),
    path.basename(audioPath) || 'audio.webm');
  form.append('text', target);
  form.append('language', lang);

  return postToService('/score', form);
}

/**
 * Chấm MỘT bản ghi đọc liền cả đoạn văn, trả điểm theo từng câu.
 *
 * Vì sao không gọi `/score` với cả đoạn làm một chuỗi: câu đầu bị căn vào toàn
 * bộ bản ghi, các câu sau cắt lệch. Bước 41 đo được đoạn 3 câu SẠCH bị báo sai
 * 6/13 từ. Dịch vụ dùng `PassageSession.score_recording` — cắt ở ranh giới câu
 * rồi chấm trọn từng câu.
 *
 * CÓ CHO CẢ HAI NGÔN NGỮ. Chỗ này từng chặn tiếng Nhật vì tưởng nhánh đó không
 * có bộ cắt câu; thực ra `segment.align_cuts` không gắn với ngôn ngữ nào, và
 * model tiếng Nhật cũng là model CTC trên âm vị nên có đủ thứ nó cần. Khác biệt
 * nằm ở KẾT QUẢ: tiếng Anh trả bốn điểm 0-10 (có nhãn người chấm), tiếng Nhật
 * trả MỨC so với người bản ngữ (không có nhãn người chấm).
 */
export async function scorePassage({ audioPath, sentences, language, mimeType }) {
  const lang = String(language || 'en').trim().toLowerCase().slice(0, 2);
  if (lang !== 'en' && lang !== 'ja') {
    const e = new Error("language phải là 'en' hoặc 'ja'");
    e.statusCode = 400;
    throw e;
  }
  const list = (sentences || []).map((x) => String(x || '').trim()).filter(Boolean);
  if (!list.length) {
    const e = new Error('Danh sách câu rỗng');
    e.statusCode = 400;
    throw e;
  }
  if (!audioPath || !fs.existsSync(audioPath)) {
    const e = new Error('Không tìm thấy file âm thanh');
    e.statusCode = 400;
    throw e;
  }
  const buf = await fs.promises.readFile(audioPath);
  const form = new FormData();
  form.append('audio', new Blob([buf], { type: mimeType || 'audio/webm' }),
    'recording.webm');
  form.append('sentences', JSON.stringify(list));
  form.append('language', lang);
  return postToService('/score_passage', form);
}

/**
 * ----- CHẤM TRỰC TIẾP -----
 *
 * Trình duyệt đẩy PCM lên từng khúc nhỏ trong lúc đọc; dịch vụ Python tự biết
 * người học đọc tới đâu (model đếm âm vị đã nghe ra) và trả trạng thái từng
 * câu/từng từ. Xem train-Ai/src/stream.py.
 *
 * Khác `/score`, ở đây GIỮ NGUYÊN mã trạng thái của dịch vụ (404 phiên hết
 * hạn, 409 thiếu khúc) vì trình duyệt cần phân biệt chúng để tự xử lý.
 */
const STREAM_TIMEOUT_MS = 60000;

async function streamCall(path, init) {
  const t = withTimeout(STREAM_TIMEOUT_MS);
  try {
    const r = await fetch(`${BASE_URL}${path}`, { ...init, signal: t.signal });
    const raw = await r.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* không phải JSON */ }
    return { status: r.status, data: data ?? { detail: raw.slice(0, 200) } };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { status: 504, data: { detail: 'Dịch vụ chấm phát âm quá thời gian chờ' } };
    }
    return {
      status: 503,
      data: { detail: 'Chưa chạy dịch vụ chấm phát âm. Trong thư mục train-Ai: .venv/Scripts/python -X utf8 -u serve.py --warm' }
    };
  } finally {
    t.done();
  }
}

export function openStream({ sentences, language }) {
  const form = new URLSearchParams();
  form.append('sentences', JSON.stringify(sentences || []));
  form.append('language', String(language || 'en'));
  return streamCall('/stream/open', { method: 'POST', body: form });
}

/** `pcm`: Buffer PCM int16 16 kHz; `offset`: số mẫu đã gửi trước khúc này. */
export function pushStream(id, offset, pcm) {
  return streamCall(`/stream/${encodeURIComponent(id)}/push?offset=${Number(offset) || 0}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: pcm
  });
}

export function closeStream(id) {
  return streamCall(`/stream/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Gọi dịch vụ Python và dịch lỗi sang thông điệp người dùng hiểu được. */
async function postToService(path, form) {
  const t = withTimeout(TIMEOUT_MS);
  try {
    const r = await fetch(`${BASE_URL}${path}`, {
      method: 'POST', body: form, signal: t.signal
    });
    const raw = await r.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      const e = new Error(`Dịch vụ trả về dữ liệu không phải JSON: ${raw.slice(0, 200)}`);
      e.statusCode = 502;
      throw e;
    }
    if (!r.ok) {
      // FastAPI gói lỗi trong { detail }. Giữ nguyên lời giải thích của dịch
      // vụ — nó nói rõ vì sao không chấm được, và người học cần biết.
      const e = new Error(data?.detail || `Dịch vụ lỗi HTTP ${r.status}`);
      e.statusCode = r.status === 503 ? 503 : 400;
      throw e;
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('Dịch vụ chấm phát âm quá thời gian chờ. Lượt gọi '
        + 'đầu phải nạp model; chạy serve.py với --warm để nạp sẵn.');
      e.statusCode = 504;
      throw e;
    }
    if (err.message?.includes('fetch failed') || err.cause?.code === 'ECONNREFUSED') {
      const e = new Error('Chưa chạy dịch vụ chấm phát âm. Trong thư mục '
        + 'train-Ai: .venv/Scripts/python -X utf8 -u serve.py --warm');
      e.statusCode = 503;
      throw e;
    }
    throw err;
  } finally {
    t.done();
  }
}

export default {
  scorePronunciation, listJapaneseProsodySentences, checkPronunciationService,
  openStream, pushStream, closeStream
};
