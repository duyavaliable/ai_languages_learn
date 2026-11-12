/*
 * Giới hạn số lần gọi theo IP (lưu trong bộ nhớ, không cần thư viện) — chặn dò mật khẩu / tạo tài khoản hàng loạt.
 * Server khởi động lại thì bộ đếm về 0; chạy nhiều tiến trình thì mỗi tiến trình đếm riêng (đủ cho đồ án).
 *
 *   rateLimit({ windowMs: 15 * 60_000, max: 10, key: (req) => ... })
 */
export function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'Thử quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.' }) {
  const hits = new Map(); // key -> { count, resetAt }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  sweep.unref?.();

  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let h = hits.get(k);
    if (!h || h.resetAt <= now) {
      h = { count: 0, resetAt: now + windowMs };
      hits.set(k, h);
    }
    h.count += 1;
    if (h.count > max) {
      const retry = Math.ceil((h.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ message: `${message} (còn khoảng ${Math.ceil(retry / 60)} phút)` });
    }
    return next();
  };
}
