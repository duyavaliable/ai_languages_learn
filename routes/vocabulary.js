import express from 'express';
import { getVocabulary, getVocabularyById, createVocabulary, updateVocabulary, deleteVocabulary, getDeletedVocabulary, restoreVocabulary, purgeVocabulary, previewVocabularyUpload, importVocabularyBatch } from '../controllers/vocabularyController.js';
import { protect, authorize } from '../middleware/auth.js';
import { uploadVocabulary } from '../middleware/upload.js';

const router = express.Router();

// Vai `teacher` da duoc gop vao `admin` -- CSDL chi con `student` va `admin`.
// Nen moi thao tac quan tri o day la admin-only. Hoc vien chi duoc GET.


router.get('/', getVocabulary);
// `/deleted` phai dat TRUOC `/:id`, khong thi Express coi 'deleted' la mot id.
router.get('/deleted', protect, authorize('admin'), getDeletedVocabulary);
router.post('/preview', protect, authorize('admin'), uploadVocabulary.single('file'), previewVocabularyUpload);
router.post('/preview-upload', protect, authorize('admin'), uploadVocabulary.single('file'), previewVocabularyUpload);
router.post('/import', protect, authorize('admin'), importVocabularyBatch);
router.post('/import-batch', protect, authorize('admin'), importVocabularyBatch);
router.post('/', protect, authorize('admin'), createVocabulary);
router.put('/:id', protect, authorize('admin'), updateVocabulary);
router.delete('/:id', protect, authorize('admin'), deleteVocabulary);
router.patch('/:id/restore', protect, authorize('admin'), restoreVocabulary);
// Xoa HAN. Chi chay duoc voi tu da xoa mem -- xem ghi chu o purgeVocabulary.
router.delete('/:id/permanent', protect, authorize('admin'), purgeVocabulary);
// `/:id` dat CUOI: Express khop route theo thu tu khai bao, nen de truoc thi
// no nuot cac duong tinh nhu `/preview` hay `/import-batch`.
router.get('/:id', getVocabularyById);

export default router;
