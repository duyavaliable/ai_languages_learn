import express from 'express';
import { register, login, getProfile, createStaffAccount, registerAdmin, registerTeacher } from '../controllers/authController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/register-teacher', registerTeacher);
router.post('/register-admin', registerAdmin);
router.post('/login', login);
router.get('/profile', protect, getProfile);
router.post('/staff', protect, authorize('admin'), createStaffAccount);

export default router;
