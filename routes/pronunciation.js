/**
 * Route chấm phát âm bằng model của đồ án.
 *
 * CHƯA ÁP DỤNG vào dự án web — xem README.md cùng thư mục.
 * Khi gắn: chép file này vào `ai_languages_learn/routes/`.
 *
 * ĐỂ RIÊNG khỏi `routes/speech.js` có chủ ý. `/api/speech/assess` gửi âm thanh
 * cho Gemini chấm câu nói TỰ DO theo thang VSTEP. Route này đối chiếu bản ghi
 * với VĂN BẢN MẪU đã biết trước, bằng model của đồ án. Trộn vào một endpoint
 * thì cả hai đều kém đi.
 *
 *   GET  /api/pronunciation/health        dịch vụ Python có sống không
 *   GET  /api/pronunciation/ja/sentences  42 câu chấm được ngữ điệu
 *   POST /api/pronunciation/score         audio + text + language
 *   POST /api/pronunciation/score-passage audio + sentences[] (chỉ tiếng Anh)
 */

import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { protect } from '../middleware/auth.js';
import {
  scorePronunciation,
  scorePassage,
  listJapaneseProsodySentences,
  checkPronunciationService,
  openStream,
  pushStream,
  closeStream
} from '../services/pronunciationService.js';
import { logLiveScoring } from '../services/liveScoringLog.js';

const router = express.Router();

// 25 MB là thừa cho một câu đọc; chặn ở đây để không nhận file lớn vô ích.
const upload = multer({
  dest: 'uploads/audio/',
  limits: { fileSize: 25 * 1024 * 1024 }
});

function cleanup(p) {
  if (!p) return;
  fs.promises.unlink(p).catch(() => { });
}

// Không cần đăng nhập: chỉ báo dịch vụ có sống không, không trả dữ liệu nào.
router.get('/health', async (_req, res) => {
  res.json(await checkPronunciationService());
});

router.get('/ja/sentences', protect, async (_req, res, next) => {
  try {
    res.json(await listJapaneseProsodySentences());
  } catch (err) {
    next(err);
  }
});

router.post('/score', protect, upload.single('audio'), async (req, res) => {
  const audioPath = req.file?.path;
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'no_audio', message: 'Chưa có file âm thanh'
      });
    }
    const language = String(req.body?.language || 'en');
    const text = String(req.body?.text || '');

    const result = await scorePronunciation({
      audioPath, text, language, mimeType: req.file.mimetype
    });

    console.log('[pronunciation/score] xong', {
      language,
      textLength: text.length,
      latency: result.latency_sec,
      hasUtteranceScores: result.has_utterance_scores
    });

    res.json(result);
  } catch (err) {
    console.error('[pronunciation/score] lỗi', {
      message: err.message, statusCode: err.statusCode
    });
    res.status(err.statusCode || 500).json({
      error: 'pronunciation_failed',
      message: err.message || 'Không chấm được phát âm'
    });
  } finally {
    cleanup(audioPath);
  }
});

/**
 * Chấm cả đoạn trong MỘT lần ghi âm. Người học đọc liền mạch, dịch vụ tự cắt
 * ở ranh giới câu rồi chấm trọn từng câu.
 *
 * `sentences` gửi lên dạng chuỗi JSON (vì multipart không có kiểu mảng).
 */
router.post('/score-passage', protect, upload.single('audio'), async (req, res) => {
  const audioPath = req.file?.path;
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'no_audio', message: 'Chưa có file âm thanh'
      });
    }
    let sentences = [];
    try {
      sentences = JSON.parse(req.body?.sentences || '[]');
    } catch {
      return res.status(400).json({
        error: 'bad_sentences', message: '`sentences` phải là mảng JSON'
      });
    }
    const language = String(req.body?.language || 'en');

    const result = await scorePassage({
      audioPath, sentences, language, mimeType: req.file.mimetype
    });

    console.log('[pronunciation/score-passage] xong', {
      language,
      sentences: sentences.length,
      done: result.sentences_done
    });

    res.json(result);
  } catch (err) {
    console.error('[pronunciation/score-passage] lỗi', {
      message: err.message, statusCode: err.statusCode
    });
    res.status(err.statusCode || 500).json({
      error: 'pronunciation_failed',
      message: err.message || 'Không chấm được đoạn văn'
    });
  } finally {
    cleanup(audioPath);
  }
});

/**
 * ----- CHẤM TRỰC TIẾP -----
 *
 *   POST   /api/pronunciation/stream/open        { sentences[], language }
 *   POST   /api/pronunciation/stream/:id/push    ?offset=  thân: PCM int16 16 kHz
 *   DELETE /api/pronunciation/stream/:id
 *
 * Thân của `push` là âm thanh THÔ (application/octet-stream), không qua multer:
 * mỗi khúc chỉ vài chục KB và đến vài lần mỗi giây, ghi ra đĩa rồi đọc lại là
 * phí. Mã trạng thái của dịch vụ được giữ nguyên — xem pronunciationService.js.
 */
function sendStream(res, { status, data }) {
  if (status >= 400) {
    const d = data?.detail;
    return res.status(status).json({
      error: 'pronunciation_stream_failed',
      message: typeof d === 'string' ? d : d?.message || 'Không chấm trực tiếp được',
      expected_offset: d?.expected_offset
    });
  }
  return res.json(data);
}

// Lý do lỗi của dịch vụ (chuỗi ngắn) để ghi nhật ký
const detailOf = (data) => {
  const d = data?.detail;
  return String(typeof d === 'string' ? d : d?.message || JSON.stringify(d ?? '')).slice(0, 300);
};

router.post('/stream/open', protect, async (req, res) => {
  const sentences = Array.isArray(req.body?.sentences) ? req.body.sentences : [];
  const language = req.body?.language;
  if (!sentences.length) {
    logLiveScoring('open', { status: 400, user: req.user?.id, language, detail: 'Danh sách câu rỗng' });
    return res.status(400).json({ error: 'bad_sentences', message: 'Danh sách câu rỗng' });
  }
  const t0 = Date.now();
  const out = await openStream({ sentences, language });
  // nhật ký chẩn đoán: MỌI lần mở phiên (thành công lẫn lỗi) — xem services/liveScoringLog.js
  logLiveScoring('open', {
    status: out.status, ms: Date.now() - t0, user: req.user?.id, language, sentences: sentences.length,
    session: out.data?.session_id, ...(out.status >= 400 ? { detail: detailOf(out.data) } : {})
  });
  sendStream(res, out);
});

router.post(
  '/stream/:id/push',
  protect,
  express.raw({ type: 'application/octet-stream', limit: '4mb' }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: 'no_audio', message: 'Thiếu âm thanh' });
    }
    const t0 = Date.now();
    const out = await pushStream(req.params.id, req.query.offset, req.body);
    // lượt gửi thành công rất dày (vài lần mỗi giây) -> chỉ ghi lượt LỖI
    if (out.status >= 400) {
      logLiveScoring('push-error', {
        status: out.status, ms: Date.now() - t0, user: req.user?.id, session: req.params.id,
        offset: Number(req.query.offset) || 0, bytes: req.body.length, detail: detailOf(out.data)
      });
    }
    sendStream(res, out);
  }
);

// Trình duyệt kể lại các lần mở phiên lỗi / thử lại (gửi khi kết nối lại được). Chỉ nhận vài trường kỹ thuật.
router.post('/client-log', protect, (req, res) => {
  const items = Array.isArray(req.body?.entries) ? req.body.entries.slice(0, 50) : [];
  const pick = (e) => ({
    at: String(e?.at || '').slice(0, 40),
    kind: String(e?.kind || '').slice(0, 40),
    attempt: Number(e?.attempt) || undefined,
    status: Number(e?.status) || undefined,
    code: e?.code ? String(e.code).slice(0, 60) : undefined,
    message: e?.message ? String(e.message).slice(0, 300) : undefined,
    ms: Number(e?.ms) || undefined,
    language: e?.language ? String(e.language).slice(0, 5) : undefined,
    page: e?.page ? String(e.page).slice(0, 120) : undefined,
    online: typeof e?.online === 'boolean' ? e.online : undefined,
    sinceLoadSec: Number(e?.sinceLoadSec) || undefined
  });
  for (const e of items) logLiveScoring('client', { user: req.user?.id, ...pick(e) });
  res.json({ ok: true, saved: items.length });
});

router.delete('/stream/:id', protect, async (req, res) => {
  sendStream(res, await closeStream(req.params.id));
});

export default router;
