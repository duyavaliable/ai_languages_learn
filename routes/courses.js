import express from 'express';
import { getCourses, getDeletedCourses, getCourseById, createCourse, updateCourse, deleteCourse, restoreCourse } from '../controllers/courseController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getCourses);
router.get('/deleted', protect, authorize('admin'), getDeletedCourses);
router.get('/:id', getCourseById);
router.post('/', protect, authorize('admin'), createCourse);
router.put('/:id', protect, authorize('admin'), updateCourse);
router.delete('/:id', protect, authorize('admin'), deleteCourse);
router.patch('/:id/restore', protect, authorize('admin'), restoreCourse);

export default router;
