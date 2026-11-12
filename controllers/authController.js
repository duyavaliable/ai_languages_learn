import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { User } from '../models/index.js';
import { passwordProblem, usernameProblem, isEmail } from '../utils/validation.js';
import { passwordStamp } from '../middleware/auth.js';

// Chỉ còn hai vai trò: student và admin (vai trò teacher đã bỏ).
const STAFF_ROLES = ['admin'];
const BCRYPT_ROUNDS = 12;

// Token đăng nhập hết hạn sau 7 ngày, và mang "dấu" của mật khẩu hiện tại (passwordStamp): đổi mật khẩu
// thì mọi token cũ (máy khác, token bị lộ) mất hiệu lực ngay — middleware/auth.js so dấu này mỗi lần gọi.
const generateToken = (user) => {
  return jwt.sign({ id: user.id, pv: passwordStamp(user.password) }, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });
};

// Đọc + kiểm tra tên / email / mật khẩu gửi lên. Chỉ nhận chuỗi (chặn gửi object/mảng vào câu truy vấn).
// Trả về { username, email, password } hoặc { problem }.
const readAccountInput = (body) => {
  const raw = body || {};
  if (typeof raw.username !== 'string' || typeof raw.email !== 'string' || typeof raw.password !== 'string') {
    return { problem: 'Cần nhập tên người dùng, email và mật khẩu' };
  }
  const username = raw.username.trim();
  const email = raw.email.trim().toLowerCase();
  const { password } = raw;
  const problem = usernameProblem(username)
    || (isEmail(email) ? null : 'Email không hợp lệ')
    || passwordProblem(password, { email, username });
  return problem ? { problem } : { username, email, password };
};

const registerWithRole = async (req, res, role) => {
  try {
    const input = readAccountInput(req.body);
    if (input.problem) return res.status(400).json({ message: input.problem });
    const { username, email, password } = input;

    const userExists = await User.findOne({
      where: { [Op.or]: [{ email }, { username }] }
    });
    if (userExists) {
      return res.status(400).json({ message: 'Email hoặc tên người dùng đã được sử dụng' });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role
    });

    const token = generateToken(user);

    return res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      token
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const register = async (req, res) => {
  return registerWithRole(req, res, 'student');
};

// Trước đây ai cũng gọi được -> bất kỳ ai cũng tự tạo được tài khoản ADMIN. Giờ chỉ dùng để tạo admin
// ĐẦU TIÊN khi CSDL chưa có admin nào; có rồi thì admin tạo thêm trong trang Quản lý tài khoản.
export const registerAdmin = async (req, res) => {
  try {
    const admins = await User.count({ where: { role: 'admin' } });
    if (admins > 0) {
      return res.status(403).json({ message: 'Hệ thống đã có quản trị viên. Tài khoản quản trị mới phải do quản trị viên tạo trong trang Quản lý tài khoản.' });
    }
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
  return registerWithRole(req, res, 'admin');
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ message: 'Cần nhập email và mật khẩu' });
    }

    // Sai email hay sai mật khẩu đều báo CÙNG một câu (không để lộ email nào đã có tài khoản)
    const user = await User.findOne({ where: { email: email.trim() } });
    if (!user) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }

    // So sánh password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }

    if (user.is_deleted) {
      return res.status(403).json({ message: 'Tài khoản này đã bị xoá. Liên hệ quản trị viên nếu cần khôi phục.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: 'Tài khoản đang bị khoá. Liên hệ quản trị viên để mở khoá.' });
    }

    const token = generateToken(user);

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      token
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createStaffAccount = async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!STAFF_ROLES.includes(role)) {
      return res.status(400).json({ message: 'role must be admin' });
    }
    const input = readAccountInput(req.body);
    if (input.problem) return res.status(400).json({ message: input.problem });
    const { username, email, password } = input;

    const userExists = await User.findOne({
      where: { [Op.or]: [{ email }, { username }] }
    });
    if (userExists) {
      return res.status(400).json({ message: 'Email hoặc tên người dùng đã được sử dụng' });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role
    });

    res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ----- ĐĂNG NHẬP BẰNG GOOGLE (nút "Tiếp tục với Google" ở trang Đăng nhập) -----
// Đúng như bản chạy thử đã duyệt (trang /google-test):
//   email Google TRÙNG tài khoản có sẵn -> đăng nhập thẳng vào tài khoản đó (mật khẩu cũ giữ nguyên)
//   CHƯA có tài khoản                   -> tạo tài khoản học viên mới; người dùng đặt MẬT KHẨU RIÊNG
//                                          cho trang web (khác mật khẩu Google) ở bước tiếp theo
//   tài khoản bị khoá / đã xoá          -> từ chối (như đăng nhập bằng mật khẩu)
// Khớp tài khoản theo EMAIL đã được Google xác minh (services/googleAuth.js); không thêm cột nào vào CSDL.

// Client ID là thông tin CÔNG KHAI (nằm trong nút Google trên trang), đưa cho trình duyệt qua đây để chỉ
// cần đặt MỘT biến GOOGLE_CLIENT_ID trong .env.
export const googleConfig = async (_req, res) => {
  const { googleClientId } = await import('../services/googleAuth.js');
  res.json({ clientId: googleClientId() || null });
};

// "Vé" giữa bước Google và bước đặt mật khẩu: JWT 15 phút, ký bằng khoá RIÊNG (khác token đăng nhập) nên
// không dùng thay token đăng nhập được, và không ai tự bịa email để tạo tài khoản.
const signupSecret = () => `${process.env.JWT_SECRET}:google-signup`;

const loginPayload = (user) => ({
  id: user.id, username: user.username, email: user.email, role: user.role, token: generateToken(user)
});

export const googleLogin = async (req, res) => {
  try {
    const { verifyGoogleIdToken } = await import('../services/googleAuth.js');
    const g = await verifyGoogleIdToken(req.body?.credential);
    const user = await User.findOne({ where: { email: g.email } });
    if (user) {
      if (user.is_deleted) {
        return res.status(403).json({ message: 'Tài khoản dùng email này đã bị xoá. Liên hệ quản trị viên nếu cần khôi phục.' });
      }
      if (!user.is_active) {
        return res.status(403).json({ message: 'Tài khoản dùng email này đang bị khoá. Liên hệ quản trị viên để mở khoá.' });
      }
      return res.json(loginPayload(user));
    }
    const ticket = jwt.sign({ purpose: 'google-signup', email: g.email, name: g.name }, signupSecret(), { expiresIn: '15m' });
    return res.json({ needPassword: true, ticket, email: g.email, name: g.name, picture: g.picture });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

export const googleRegister = async (req, res) => {
  try {
    let t;
    try {
      t = jwt.verify(String(req.body?.ticket || ''), signupSecret());
    } catch {
      return res.status(400).json({ message: 'Phiên đăng ký bằng Google đã hết hạn — hãy bấm "Tiếp tục với Google" lại' });
    }
    if (t.purpose !== 'google-signup' || !t.email) {
      return res.status(400).json({ message: 'Phiên đăng ký bằng Google không hợp lệ' });
    }
    const username = String(req.body?.username ?? '').trim();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const problem = usernameProblem(username) || passwordProblem(password, { email: t.email, username });
    if (problem) return res.status(400).json({ message: problem });
    if (await User.findOne({ where: { email: t.email } })) {
      return res.status(400).json({ message: 'Email này vừa được dùng để tạo tài khoản — hãy bấm "Tiếp tục với Google" lại để đăng nhập' });
    }
    if (await User.findOne({ where: { username } })) {
      return res.status(400).json({ message: 'Tên này đã có người dùng, hãy chọn tên khác' });
    }
    const user = await User.create({
      username, email: t.email, password: await bcrypt.hash(password, BCRYPT_ROUNDS), role: 'student'
    });
    return res.status(201).json(loginPayload(user));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Trang Hồ sơ: đổi tên hiển thị (username). Email không đổi ở đây (là thông tin đăng nhập).
export const updateProfile = async (req, res) => {
  try {
    const username = String(req.body?.username ?? '').trim();
    if (username.length < 2 || username.length > 50) {
      return res.status(400).json({ message: 'Tên hiển thị phải dài 2–50 ký tự' });
    }
    const taken = await User.findOne({ where: { username, id: { [Op.ne]: req.user.id } } });
    if (taken) return res.status(400).json({ message: 'Tên này đã có người dùng, hãy chọn tên khác' });
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    user.username = username;
    await user.save();
    return res.json({ id: user.id, username: user.username, email: user.email, role: user.role });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Trang Hồ sơ: đổi mật khẩu — phải nhập đúng mật khẩu hiện tại.
export const changePassword = async (req, res) => {
  try {
    const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const next = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    const problem = passwordProblem(next, { email: user.email, username: user.username });
    if (problem) return res.status(400).json({ message: problem.replace(/^Mật khẩu/, 'Mật khẩu mới') });
    if (!(await bcrypt.compare(current, user.password))) {
      return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
    }
    if (await bcrypt.compare(next, user.password)) {
      return res.status(400).json({ message: 'Mật khẩu mới phải khác mật khẩu hiện tại' });
    }
    user.password = await bcrypt.hash(next, BCRYPT_ROUNDS);
    await user.save();
    // Token cũ (mọi máy) hết hiệu lực vì dấu mật khẩu đổi; trả token mới để máy đang dùng không bị đăng xuất.
    return res.json({ message: 'Đã đổi mật khẩu. Các thiết bị khác sẽ phải đăng nhập lại.', token: generateToken(user) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
