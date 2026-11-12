/*
 * Quy cách tài khoản — DÙNG CHUNG cho server (controllers) và trang web (Đăng ký, Hồ sơ, Quản lý tài khoản),
 * để hai bên luôn kiểm tra giống nhau. File thuần JS, không phụ thuộc thư viện nào.
 *
 * Mật khẩu:
 *   - 8 đến 72 ký tự (bcrypt chỉ dùng 72 byte đầu — dài hơn thì phần sau bị bỏ qua, nên chặn luôn)
 *   - có ít nhất một chữ cái và một chữ số
 *   - không trùng email, phần trước @ của email hay tên người dùng
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_RULE_TEXT = `Mật khẩu ${PASSWORD_MIN}–${PASSWORD_MAX_BYTES} ký tự, có cả chữ cái và chữ số.`;

const byteLength = (s) => new TextEncoder().encode(s).length;

/** Trả về câu báo lỗi (tiếng Việt) hoặc null nếu mật khẩu hợp lệ. */
export function passwordProblem(password, { email = '', username = '' } = {}) {
  if (typeof password !== 'string' || password.length === 0) return 'Cần nhập mật khẩu';
  if (password.length < PASSWORD_MIN) return `Mật khẩu phải có ít nhất ${PASSWORD_MIN} ký tự`;
  if (byteLength(password) > PASSWORD_MAX_BYTES) return `Mật khẩu quá dài (tối đa ${PASSWORD_MAX_BYTES} ký tự)`;
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return 'Mật khẩu phải có cả chữ cái và chữ số';
  const low = password.toLowerCase();
  const mail = String(email || '').trim().toLowerCase();
  const name = String(username || '').trim().toLowerCase();
  if ((mail && (low === mail || low === mail.split('@')[0])) || (name && low === name)) {
    return 'Mật khẩu không được trùng email hoặc tên người dùng';
  }
  return null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (email) => typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);

/** Tên người dùng (tên hiển thị): 2–50 ký tự sau khi bỏ khoảng trắng hai đầu. */
export function usernameProblem(username) {
  const u = typeof username === 'string' ? username.trim() : '';
  if (u.length < 2 || u.length > 50) return 'Tên người dùng phải dài 2–50 ký tự';
  return null;
}
