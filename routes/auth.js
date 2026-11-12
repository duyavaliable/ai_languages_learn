import express from 'express';
import { register, login, getProfile, updateProfile, changePassword, createStaffAccount, registerAdmin, googleConfig, googleLogin, googleRegister } from '../controllers/authController.js';
import { protect, authorize } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

const MIN = 60_000;
// Đăng nhập: tối đa 10 lần / 15 phút cho mỗi (IP + email), và 50 lần / 15 phút cho mỗi IP.
const loginPerAccount = rateLimit({ windowMs: 15 * MIN, max: 10, key: (req) => `${req.ip}|${String(req.body?.email ?? '').toLowerCase()}` });
const loginPerIp = rateLimit({ windowMs: 15 * MIN, max: 50 });
// Tạo tài khoản: 20 lần / giờ cho mỗi IP. Google: 30 lần / 15 phút.
const signupLimit = rateLimit({ windowMs: 60 * MIN, max: 20 });
const googleLimit = rateLimit({ windowMs: 15 * MIN, max: 30 });
// Đổi mật khẩu: 10 lần / 15 phút (chặn dò mật khẩu hiện tại khi lấy được token).
const passwordLimit = rateLimit({ windowMs: 15 * MIN, max: 10 });

router.post('/register', signupLimit, register);
// Chỉ tạo được admin ĐẦU TIÊN (khi CSDL chưa có admin nào) — xem registerAdmin.
router.post('/register-admin', signupLimit, registerAdmin);
router.post('/login', loginPerIp, loginPerAccount, login);
// Đăng nhập / đăng ký bằng Google: trùng email -> đăng nhập; chưa có -> đặt mật khẩu riêng rồi tạo tài khoản
router.get('/google/config', googleConfig);
router.post('/google', googleLimit, googleLogin);
router.post('/google/register', signupLimit, googleRegister);
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.put('/password', protect, passwordLimit, changePassword);
router.post('/staff', protect, authorize('admin'), createStaffAccount);

export default router;
