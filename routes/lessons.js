import express from 'express';
import { getLessons, getDeletedLessons, getLessonById, createLesson, updateLesson, deleteLesson, restoreLesson, completeLesson } from '../controllers/lessonController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', protect, getLessons);
router.get('/deleted', protect, authorize('admin'), getDeletedLessons);
router.get('/:id', protect, getLessonById);
router.post('/complete', protect, completeLesson);
router.post('/teacher-create', protect, authorize('teacher'), createLesson);
router.post('/', protect, authorize('admin'), createLesson);
router.put('/:id', protect, authorize('admin'), updateLesson);
router.delete('/:id', protect, authorize('admin'), deleteLesson);
router.patch('/:id/restore', protect, authorize('admin'), restoreLesson);

export default router;
