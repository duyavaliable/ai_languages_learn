import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  listSpeakingPassages,
  getSpeakingPassageById,
  createSpeakingPassage,
  updateSpeakingPassage,
  deleteSpeakingPassage
} from '../controllers/speakingPassageController.js';

/**
 * Bài đọc cho phần chấm phát âm.
 *
 *   GET    /api/speaking-passages            danh sách (?language_id=1|2)
 *   GET    /api/speaking-passages/:id        một bài, kèm từng dòng
 *   POST   /api/speaking-passages            admin thêm bài
 *   PUT    /api/speaking-passages/:id        sửa
 *   DELETE /api/speaking-passages/:id        xoá mềm
 */
const router = express.Router();

// Vai `teacher` da duoc gop vao `admin` -- CSDL chi con `student` va `admin`.
// Nen moi thao tac quan tri o day la admin-only. Hoc vien chi duoc GET.


router.get('/', protect, listSpeakingPassages);
router.get('/:id', protect, getSpeakingPassageById);
router.post('/', protect, authorize('admin'), createSpeakingPassage);
router.put('/:id', protect, authorize('admin'), updateSpeakingPassage);
router.delete('/:id', protect, authorize('admin'), deleteSpeakingPassage);

export default router;
