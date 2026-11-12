import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  createSpeakingAttempt,
  listSpeakingAttempts,
  getSpeakingProgress
} from '../controllers/speakingAttemptController.js';

/**
 * Lịch sử các lần đọc to đã được chấm.
 *
 *   POST /api/speaking-attempts            lưu một lần chấm
 *   GET  /api/speaking-attempts            các lần của chính mình
 *   GET  /api/speaking-attempts/progress   đường tiến bộ theo bài
 *
 * Không có PUT/DELETE, có chủ ý: đây là BẢN GHI PHÉP ĐO. Sửa được một lần
 * chấm thì đường tiến bộ không còn là bằng chứng. Muốn bỏ thì xoá ở CSDL.
 *
 * `protect` cho cả ba, không `authorize`: học viên phải ghi và đọc được
 * chính mình. Việc chặn xem của người khác làm trong controller
 * (`user_id` từ token; `?user_id=` chỉ admin dùng được).
 *
 * ⚠️ `/progress` phải khai TRƯỚC `/:id` nếu sau này có thêm route theo id,
 * không thì Express coi "progress" là một id.
 */
const router = express.Router();

router.post('/', protect, createSpeakingAttempt);
router.get('/progress', protect, getSpeakingProgress);
router.get('/', protect, listSpeakingAttempts);

export default router;
