import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Lỗi proxy (Node cổng 5000 chưa lên / ngắt kết nối): Vite chỉ trả 500 rỗng cho trình duyệt, nên ghi lại
// vào logs/live-scoring.log để chẩn đoán (cùng file với nhật ký của Node — services/liveScoringLog.js).
const logProxyError = (err, req) => {
  try {
    const dir = path.resolve(__dirname, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'live-scoring.log'), `${JSON.stringify({
      t: new Date().toISOString(), event: 'vite-proxy-error',
      method: req?.method, url: String(req?.url || '').replace(/\?.*$/, '').slice(0, 120),
      code: err?.code, message: String(err?.message || '').slice(0, 200)
    })}\n`);
  } catch { /* ghi nhật ký hỏng thì thôi */ }
};
const watchProxy = (proxy) => proxy.on('error', logProxyError);

export default defineConfig({
  plugins: [react()],
  // Ảnh tĩnh (minh hoạ thẻ bài, ảnh cắt từ đề JLPT...) nằm ở `public/`.
  // Trước đây trỏ `frontend/public` — thư mục không tồn tại nên mọi ảnh 404.
  publicDir: path.resolve(__dirname, './public'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    // Luôn chạy ở 3000: cổng bận thì BÁO LỖI thay vì lặng lẽ chuyển sang 3001 (mở nhầm trang cũ / tab cũ).
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        configure: watchProxy
      },
      // File tải lên (âm thanh bài nghe...) do server Node phục vụ. Không proxy
      // thì Vite trả index.html cho file không có -> lỗi bị che mất.
      '/uploads': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      }
    }
  }
});
