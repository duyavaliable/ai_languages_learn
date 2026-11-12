/**
 * Chạy máy chủ LanguageTool (bắt lỗi ngữ pháp/chính tả tiếng Anh bằng LUẬT,
 * không dùng model AI) — CHỈ trong lúc `npm run dev` của dự án này.
 *
 *   npm run dev       -> concurrently chạy vite + server.js + script này
 *   Ctrl+C            -> concurrently dừng cả ba; script này tắt luôn Java
 *
 * Không cài thành dịch vụ hệ thống, không tự chạy khi mở máy: ngoài
 * `npm run dev` ở thư mục này thì LanguageTool không chạy.
 *
 * LanguageTool nằm ở `tools/LanguageTool-<phiên bản>/` (không đưa lên git,
 * nặng ~250 MB). Chưa có thì chạy `npm run lt:setup` để tải bản chính thức.
 * Cần Java 17 trở lên.
 *
 * Chỉ nghe ở 127.0.0.1 (mặc định của LanguageTool khi không có --public):
 * trình duyệt không gọi thẳng, mà qua Express — services/writingService.js.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';

const PORT = Number(process.env.LANGUAGETOOL_PORT || 8081);
const TOOLS = path.resolve('tools');

function findJar() {
  if (!fs.existsSync(TOOLS)) return null;
  const dirs = fs.readdirSync(TOOLS)
    .filter((d) => /^LanguageTool-\d/.test(d))
    .sort()
    .reverse();                       // bản mới nhất trước
  for (const d of dirs) {
    const jar = path.join(TOOLS, d, 'languagetool-server.jar');
    if (fs.existsSync(jar)) return jar;
  }
  return null;
}

function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: '127.0.0.1', port });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

const jar = findJar();
if (!jar) {
  console.log('[languagetool] Chưa có LanguageTool trong tools/. Chạy: npm run lt:setup');
  console.log('[languagetool] Trang web vẫn chạy; chỉ phần chấm bài viết báo "chưa sẵn sàng".');
  process.exit(0);
}

if (await portInUse(PORT)) {
  // Một `npm run dev` khác đang chạy LanguageTool: dùng chung, không mở thêm.
  console.log(`[languagetool] Cổng ${PORT} đã có máy chủ chạy sẵn — dùng chung, không mở thêm.`);
  process.exit(0);
}

console.log(`[languagetool] ${path.relative(process.cwd(), jar)} · cổng ${PORT} (chỉ localhost)`);
const java = spawn('java', [
  '-Xmx1g',
  '-cp', jar,
  'org.languagetool.server.HTTPServer',
  '--port', String(PORT)
], { cwd: path.dirname(jar), stdio: 'inherit' });

java.on('error', (err) => {
  console.error(`[languagetool] Không chạy được Java (${err.message}). Cần Java 17+ trong PATH.`);
  process.exit(0);
});
java.on('exit', (code) => process.exit(code ?? 0));

// Dừng `npm run dev` thì tắt Java theo — không để sót tiến trình nền.
const stop = () => { if (!java.killed) java.kill(); };
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(sig, () => { stop(); process.exit(0); });
}
process.on('exit', stop);
