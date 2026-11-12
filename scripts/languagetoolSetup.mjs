/**
 * Tải LanguageTool bản ổn định chính thức về `tools/` (chạy một lần):
 *
 *   npm run lt:setup
 *
 * Nguồn: https://languagetool.org/download/LanguageTool-stable.zip (~250 MB,
 * giấy phép LGPL). Giải nén bằng `tar` có sẵn trên Windows 10+ / macOS / Linux.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const URL = 'https://languagetool.org/download/LanguageTool-stable.zip';
const TOOLS = path.resolve('tools');
const ZIP = path.join(TOOLS, 'LanguageTool-stable.zip');

fs.mkdirSync(TOOLS, { recursive: true });
const have = fs.readdirSync(TOOLS).find((d) => /^LanguageTool-\d/.test(d)
  && fs.existsSync(path.join(TOOLS, d, 'languagetool-server.jar')));
if (have) {
  console.log(`Đã có ${have} trong tools/ — không tải lại.`);
  process.exit(0);
}

console.log(`Đang tải ${URL} ...`);
const res = await fetch(URL);
if (!res.ok) throw new Error(`Tải thất bại: HTTP ${res.status}`);
fs.writeFileSync(ZIP, Buffer.from(await res.arrayBuffer()));
console.log('Đang giải nén ...');
execFileSync('tar', ['-xf', ZIP, '-C', TOOLS], { stdio: 'inherit' });
fs.unlinkSync(ZIP);
console.log('Xong. Chạy `npm run dev` là LanguageTool chạy cùng.');
