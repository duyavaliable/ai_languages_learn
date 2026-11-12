/**
 *   POST /api/furigana   { texts: string[] } -> { segments: [{ text, ruby? }][] }
 *
 * Dùng cho trang hiển thị tiếng Nhật: đặt hiragana nhỏ trên chữ kanji.
 */

import express from 'express';
import { furiganaBatch } from '../services/furiganaService.js';

const router = express.Router();

// Chặn yêu cầu quá lớn: một hội thoại chỉ vài chục câu.
const MAX_TEXTS = 200;
const MAX_CHARS = 2000;

router.post('/', async (req, res, next) => {
  try {
    const texts = req.body?.texts;
    if (!Array.isArray(texts) || texts.length > MAX_TEXTS) {
      return res.status(400).json({ message: `texts phải là mảng tối đa ${MAX_TEXTS} câu` });
    }
    const clean = texts.map((t) => String(t ?? '').slice(0, MAX_CHARS));
    res.json({ segments: await furiganaBatch(clean) });
  } catch (err) {
    next(err);
  }
});

export default router;
