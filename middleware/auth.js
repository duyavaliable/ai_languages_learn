import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

/**
 * "Dấu" của mật khẩu hiện tại, nhét vào token đăng nhập (trường `pv`). Là HMAC của chuỗi băm bcrypt nên
 * không lộ gì về mật khẩu; đổi mật khẩu -> chuỗi băm đổi -> dấu đổi -> mọi token cũ bị từ chối.
 */
export const passwordStamp = (passwordHash) => crypto
  .createHmac('sha256', String(process.env.JWT_SECRET || ''))
  .update(String(passwordHash || ''))
  .digest('base64url')
  .slice(0, 16);

export const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ message: 'Not authorized to access this route' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Token cấp trước lần đổi mật khẩu gần nhất (hoặc token kiểu cũ không có dấu) -> phải đăng nhập lại.
    // Đọc chuỗi băm riêng (raw) để req.user vẫn KHÔNG chứa mật khẩu như trước.
    const secret = await User.findByPk(decoded.id, { attributes: ['password'], raw: true });
    if (!decoded.pv || decoded.pv !== passwordStamp(secret?.password)) {
      return res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' });
    }

    if (user.is_deleted) {
      return res.status(403).json({ message: 'Account has been deleted' });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: 'Account is locked' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized to access this route' });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized to access this route' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }

    next();
  };
};
