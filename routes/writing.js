/**
 * Chấm bài viết tiếng Anh cơ bản bằng LUẬT (LanguageTool + chỉ số văn bản),
 * không dùng AI. Xem services/writingService.js.
 *
 *   GET  /api/writing/health   LanguageTool có đang chạy không
 *   POST /api/writing/check    { text, prompt?, minWords? }
 */
import express from 'express';
import { protect } from '../middleware/auth.js';
import { assessWriting, checkWritingService, MAX_CHARS } from '../services/writingService.js';

const router = express.Router();

router.get('/health', async (req, res) => {
  res.json(await checkWritingService());
});

router.post('/check', protect, async (req, res) => {
  const text = String(req.body?.text || '');
  if (!text.trim()) {
    return res.status(400).json({ message: 'Bài viết đang trống.' });
  }
  if (text.length > MAX_CHARS) {
    return res.status(400).json({ message: `Bài viết dài quá ${MAX_CHARS} ký tự.` });
  }
  // Chỉ chấm tiếng Anh: bài gần như không có chữ Latin (vd. tiếng Nhật) thì
  // báo rõ thay vì trả về hàng loạt "lỗi chính tả" vô nghĩa.
  const letters = text.match(/\p{L}/gu) || [];
  const latin = letters.filter((c) => /[A-Za-z]/.test(c)).length;
  if (letters.length && latin / letters.length < 0.8) {
    return res.status(400).json({ message: 'Hiện chỉ chấm được bài viết tiếng Anh.' });
  }
  try {
    const result = await assessWriting({
      text,
      prompt: String(req.body?.prompt || ''),
      minWords: Number(req.body?.minWords) || 0
    });
    res.json(result);
  } catch (err) {
    if (err.code === 'LT_UNAVAILABLE') {
      console.error('[writing] LanguageTool unavailable:', err.cause?.message);
      return res.status(503).json({ message: err.message });
    }
    console.error('[writing] check failed:', err);
    res.status(500).json({ message: 'Không chấm được bài viết.' });
  }
});

export default router;
