/**
 * Đăng nhập bằng Google (Google Identity Services) — kiểm tra "ID token" trình duyệt nhận từ Google.
 *
 * Luồng: trình duyệt hiện nút Google (Client ID công khai) -> người dùng chọn tài khoản Google -> Google trả
 * cho trình duyệt một ID token (JWT do Google ký) -> gửi lên đây -> server hỏi Google token có thật không.
 * Mật khẩu Google KHÔNG bao giờ đi qua trang web này.
 *
 * Kiểm tra bằng endpoint tokeninfo của Google (Google tự kiểm chữ ký), rồi tự kiểm thêm:
 *   aud   = GOOGLE_CLIENT_ID của dự án (token cấp cho ĐÚNG ứng dụng này, không phải app khác)
 *   iss   = accounts.google.com
 *   exp   = còn hạn
 *   email_verified = true (Google đã xác minh email)
 *
 * Cấu hình (.env): GOOGLE_CLIENT_ID=<...>.apps.googleusercontent.com — xem hướng dẫn trong trang /google-test.
 */
const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

export const googleClientId = () => String(process.env.GOOGLE_CLIENT_ID || '').trim();

export async function verifyGoogleIdToken(idToken) {
  const clientId = googleClientId();
  if (!clientId) {
    const e = new Error('Chưa cấu hình GOOGLE_CLIENT_ID trong .env');
    e.statusCode = 503;
    throw e;
  }
  const token = String(idToken || '');
  if (!token || token.length > 4096 || token.split('.').length !== 3) {
    const e = new Error('Mã đăng nhập Google không hợp lệ');
    e.statusCode = 400;
    throw e;
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10000);
  let info;
  try {
    const r = await fetch(`${TOKENINFO}?id_token=${encodeURIComponent(token)}`, { signal: ac.signal });
    info = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error('Google không xác nhận mã đăng nhập này (có thể đã hết hạn — hãy bấm nút Google lại)');
      e.statusCode = 401;
      throw e;
    }
  } catch (err) {
    if (err.statusCode) throw err;
    const e = new Error(err.name === 'AbortError' ? 'Google phản hồi quá chậm, thử lại sau' : `Không kết nối được tới Google (${err.message})`);
    e.statusCode = 502;
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const fail = (msg) => { const e = new Error(msg); e.statusCode = 401; throw e; };
  if (info.aud !== clientId) fail('Mã đăng nhập này không cấp cho ứng dụng của trang web (sai Client ID)');
  if (!ISSUERS.has(info.iss)) fail('Mã đăng nhập không do Google cấp');
  if (!(Number(info.exp) * 1000 > Date.now())) fail('Mã đăng nhập Google đã hết hạn — hãy bấm nút Google lại');
  if (String(info.email_verified) !== 'true') fail('Email của tài khoản Google này chưa được Google xác minh');
  return {
    sub: String(info.sub),               // mã định danh CỐ ĐỊNH của tài khoản Google (không đổi kể cả khi đổi email)
    email: String(info.email || '').toLowerCase(),
    name: info.name ? String(info.name) : '',
    picture: info.picture ? String(info.picture) : '',
    hd: info.hd ? String(info.hd) : ''   // tên miền Google Workspace (nếu là tài khoản tổ chức)
  };
}
