/**
 * NHẬT KÝ CHẨN ĐOÁN chấm trực tiếp — logs/live-scoring.log (mỗi dòng một JSON).
 *
 * Để khi "Không mở được phiên chấm trực tiếp" lặp lại thì biết hỏng ở khâu nào:
 *   vite-proxy-error   Vite không chuyển được yêu cầu tới Node (Node chưa lên / mất kết nối)  — vite.config.js
 *   node-start         Node vừa khởi động (đối chiếu giờ với lỗi)                              — server.js
 *   open / push-error  Node gọi dịch vụ Python: mã trả về, thời gian, lý do                   — routes/pronunciation.js
 *   client             trình duyệt tự kể lại các lần mở phiên lỗi / thử lại                   — src/lib/liveScoring.js
 * Chỉ ghi THÔNG TIN KỸ THUẬT (giờ, mã lỗi, thời gian, ngôn ngữ, số câu, id người dùng) — không ghi âm thanh
 * hay nội dung bài. File tự cắt khi quá 2 MB (giữ một bản .1). Thư mục logs/ đã nằm trong .gitignore.
 */
import fs from 'fs';
import path from 'path';

const DIR = path.resolve('logs');
const FILE = path.join(DIR, 'live-scoring.log');
const MAX_BYTES = 2 * 1024 * 1024;

export function logLiveScoring(event, data = {}) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    try {
      if (fs.statSync(FILE).size > MAX_BYTES) fs.renameSync(FILE, `${FILE}.1`);
    } catch { /* chưa có file */ }
    const line = JSON.stringify({ t: new Date().toISOString(), event, ...data });
    fs.appendFileSync(FILE, `${line}\n`);
  } catch (e) {
    // ghi nhật ký hỏng không được làm hỏng việc chấm
    console.error('[live-scoring log]', e.message);
  }
}

export const LIVE_SCORING_LOG = FILE;
