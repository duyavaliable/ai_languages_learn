import express from 'express';
import { getExercises, getExerciseById, updateExerciseContent, deleteExercise, previewExerciseFile, createExercisesFromParts, replaceExerciseAudio, restoreExercise, previewDocxExam, createDocxExam, startScanExam, getScanExamStatus, cancelScanExam, createScanExam, attachScanKey } from '../controllers/exerciseController.js';
import { protect, authorize } from '../middleware/auth.js';
import uploadAudio, { uploadVocabulary } from '../middleware/upload.js';

const router = express.Router();

router.get('/', protect, getExercises);
router.get('/:id', protect, getExerciseById);
router.put('/:id', protect, authorize('admin'), updateExerciseContent);
router.delete('/:id', protect, authorize('admin'), deleteExercise);
// Thay file nghe sai (bài nghe). Trường file: `audioFile`.
router.put('/:id/audio', protect, authorize('admin'), uploadAudio.single('audioFile'), replaceExerciseAudio);
router.patch('/:id/restore', protect, authorize('admin'), restoreExercise);
router.post('/preview-parts', protect, authorize('admin'), uploadVocabulary.single('file'), previewExerciseFile);
// Đề trắc nghiệm Word (.docx) Đọc / Nghe: xem trước -> admin duyệt -> lưu
router.post('/docx-preview', protect, authorize('admin'), uploadVocabulary.single('file'), previewDocxExam);
router.post('/docx-create', protect, authorize('admin'), uploadAudio.single('audioFile'), createDocxExam);
// Đề PDF quét (Đọc / Nghe): bắt đầu quét nền -> hỏi tiến độ -> admin duyệt -> lưu
router.post('/scan-start', protect, authorize('admin'),
  uploadVocabulary.fields([{ name: 'file', maxCount: 1 }, { name: 'keyFile', maxCount: 1 }]), startScanExam);
router.get('/scan-status/:id', protect, authorize('admin'), getScanExamStatus);
router.delete('/scan/:id', protect, authorize('admin'), cancelScanExam);
// quét xong mà thiếu đáp án: gắn file đáp án, đọc lại bảng đáp án trên OCR có sẵn (không quét lại đề)
router.post('/scan-key/:id', protect, authorize('admin'), uploadVocabulary.single('keyFile'), attachScanKey);
// file nghe: MỘT file cho cả đề, hoặc nhiều file (mỗi câu / mỗi mục một file) — trường `audioFiles`
router.post('/scan-create', protect, authorize('admin'), uploadAudio.array('audioFiles', 300), createScanExam);
router.post('/create-from-parts', protect, authorize('admin'), uploadAudio.single('audioFile'), createExercisesFromParts);

export default router;
