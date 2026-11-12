/**
 * Quét đề PDF (scan / PDF chỉ có ảnh) bằng dây chuyền Python ở services/scan (PaddleOCR chạy trên máy,
 * không gửi đề ra dịch vụ ngoài).
 *
 * Quét mất vài phút nên chạy NỀN theo "phiên quét" (job):
 *   startScanJob()  -> lưu file vào uploads/scan-jobs/<id>/, xếp hàng, trả id ngay
 *   getScanJob()    -> tiến độ; xong thì kèm đề đã dựng để admin duyệt
 *   saveScanImages() -> khi lưu bài: chép ảnh đang dùng sang uploads/scan/<id>/, xoá thư mục phiên
 * Mỗi lúc chỉ chạy MỘT phiên (OCR rất nặng), các phiên khác chờ.
 *
 * Cấu hình (.env):
 *   SCAN_PYTHON  đường dẫn python của môi trường đã cài PaddleOCR (mặc định: python)
 */
import { spawn } from 'child_process';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

const SCRIPT = path.resolve('services', 'scan', 'scan_exam.py');
const JOBS_DIR = path.resolve('uploads', 'scan-jobs');
const PUBLIC_DIR = path.resolve('uploads', 'scan');
const JOB_TIMEOUT_MS = 40 * 60 * 1000;
const JOB_TTL_MS = 24 * 60 * 60 * 1000;
const ID_RE = /^[a-f0-9]{16}$/;

const jobs = new Map();
const queue = [];
let running = null;

const jobDir = (id) => path.join(JOBS_DIR, id);
const jobUrl = (id, name) => `/uploads/scan-jobs/${id}/${name}`;

export const OCR_LANG = { ja: 'japan', en: 'en' };

/** Xếp hàng một phiên quét. Trả về id phiên. */
export async function startScanJob({ pdf, key, pages, keyPages, skill, lang, fileName }) {
  await cleanupOldJobs();
  const id = crypto.randomBytes(8).toString('hex');
  const dir = jobDir(id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'exam.pdf'), pdf);
  if (key) await fs.writeFile(path.join(dir, 'key.pdf'), key);
  const job = {
    id, status: 'queued', fileName, skill, lang,
    pages: String(pages || '').trim(), keyPages: String(keyPages || '').trim(), hasKey: Boolean(key),
    progress: { done: 0, total: 0, step: 'đang chờ lượt quét' },
    log: [], error: null, result: null, createdAt: Date.now(), child: null
  };
  jobs.set(id, job);
  queue.push(id);
  pump();
  return id;
}

/**
 * Đã quét xong mà thiếu đáp án (quên tải file đáp án): gắn file đáp án / trang đáp án rồi chạy lại
 * BẰNG KẾT QUẢ OCR ĐÃ CÓ của đề — không OCR lại đề, chỉ đọc bảng đáp án (vài giây tới ~nửa phút).
 */
export async function rescanWithKey(id, { key, keyPages }) {
  const job = ID_RE.test(String(id || '')) ? jobs.get(id) : null;
  if (!job) return { error: 'Không có phiên quét này (có thể server đã khởi động lại) — hãy quét lại', status: 404 };
  if (job.status !== 'done') return { error: 'Phiên quét chưa xong', status: 409 };
  const ocr = path.join(jobDir(id), 'out', 'ocr');
  if (!fsSync.existsSync(ocr)) return { error: 'Kết quả OCR của phiên đã bị xoá — hãy quét lại cả đề kèm file đáp án', status: 410 };
  if (key) await fs.writeFile(path.join(jobDir(id), 'key.pdf'), key);
  else await fs.rm(path.join(jobDir(id), 'key.pdf'), { force: true });
  await fs.rm(path.join(jobDir(id), 'out', 'key_ocr'), { recursive: true, force: true });
  Object.assign(job, {
    hasKey: Boolean(key), keyPages: String(keyPages || '').trim(), reuseOcr: true,
    status: 'queued', result: null, error: null, createdAt: Date.now(),
    progress: { done: 0, total: 0, step: 'đang chờ lượt đọc bảng đáp án' }
  });
  queue.push(id);
  pump();
  return { ok: true };
}

export function getScanJob(id) {
  if (!ID_RE.test(String(id || ''))) return null;
  const job = jobs.get(id);
  if (!job) return null;
  const ahead = job.status === 'queued' ? queue.indexOf(id) + (running ? 1 : 0) : 0;
  return {
    id: job.id, status: job.status, fileName: job.fileName, skill: job.skill,
    progress: job.progress, queuePosition: ahead, error: job.error,
    log: job.log.slice(-15),
    result: job.status === 'done' ? job.result : null
  };
}

export async function cancelScanJob(id) {
  const job = ID_RE.test(String(id || '')) ? jobs.get(id) : null;
  if (!job) return false;
  if (job.child) job.child.kill();
  const qi = queue.indexOf(id);
  if (qi >= 0) queue.splice(qi, 1);
  jobs.delete(id);
  await fs.rm(jobDir(id), { recursive: true, force: true });
  return true;
}

function pump() {
  if (running || !queue.length) return;
  const id = queue.shift();
  const job = jobs.get(id);
  if (!job) { pump(); return; }
  running = id;
  runJob(job)
    .catch((e) => { job.status = 'error'; job.error = e.message; })
    .finally(() => { job.child = null; running = null; pump(); });
}

function runJob(job) {
  const dir = jobDir(job.id);
  const out = path.join(dir, 'out');
  const args = [SCRIPT, '--pdf', path.join(dir, 'exam.pdf'), '--out', out,
    '--lang', OCR_LANG[job.lang] || 'japan', '--skill', job.skill === 'listening' ? 'listening' : 'reading'];
  if (job.pages) args.push('--pages', job.pages);
  if (job.hasKey) args.push('--key', path.join(dir, 'key.pdf'));
  if (job.keyPages) args.push('--key-pages', job.keyPages);
  if (job.reuseOcr) args.push('--reuse-ocr', path.join(out, 'ocr'));
  job.status = 'running';
  job.progress = { done: 0, total: 0, step: 'khởi động bộ OCR' };

  return new Promise((resolve, reject) => {
    const child = spawn(process.env.SCAN_PYTHON || 'python', args, {
      cwd: path.dirname(SCRIPT),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True' },
      windowsHide: true
    });
    job.child = child;
    const timer = setTimeout(() => child.kill(), JOB_TIMEOUT_MS);
    let buf = '';
    let errTail = '';
    child.stdout.on('data', (d) => {
      buf += d.toString('utf8');
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const line of lines) {
        const m = line.match(/^PROGRESS (\d+)\/(\d+) (.*)$/);
        if (m) job.progress = { done: Number(m[1]), total: Number(m[2]), step: m[3] };
        else if (line.trim()) { job.log.push(line.trim()); if (job.log.length > 400) job.log.shift(); }
      }
    });
    child.stderr.on('data', (d) => { errTail = (errTail + d.toString('utf8')).slice(-4000); });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`Không chạy được Python cho bộ quét (${e.message}). Kiểm tra SCAN_PYTHON trong .env.`));
    });
    child.on('close', async (code) => {
      clearTimeout(timer);
      if (!jobs.has(job.id)) { resolve(); return; }          // đã huỷ
      if (code !== 0) {
        const last = errTail.trim().split(/\r?\n/).filter((l) => !/warn/i.test(l)).slice(-3).join(' | ');
        reject(new Error(`Bộ quét dừng với mã ${code}${last ? `: ${last}` : ''}`));
        return;
      }
      try {
        job.result = await buildReview(job, out);
        job.status = 'done';
        job.progress = { ...job.progress, step: 'xong' };
        // GIỮ kết quả OCR của đề (out/ocr) tới khi lưu / huỷ / hết hạn 24 giờ: nếu thiếu đáp án,
        // admin gắn file đáp án ở bước duyệt và chỉ cần đọc lại bảng đáp án (rescanWithKey)
        await fs.rm(path.join(out, 'key_ocr'), { recursive: true, force: true });
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}

/** PNG cắt từ đề -> JPEG nhẹ trong thư mục phiên; trả URL. */
async function toJpeg(job, srcPath, name, width = 1400) {
  const outName = name.replace(/\.png$/i, '.jpg');
  await sharp(srcPath).flatten({ background: '#ffffff' })
    .resize({ width, withoutEnlargement: true }).jpeg({ quality: 84 })
    .toFile(path.join(jobDir(job.id), outName));
  return jobUrl(job.id, outName);
}

const ABC = (i) => String.fromCharCode(65 + i);

/** Kết quả Python -> đề để admin duyệt, cùng dạng câu hỏi mà trang làm bài hiển thị. */
async function buildReview(job, out) {
  const raw = JSON.parse(await fs.readFile(path.join(out, 'result.json'), 'utf8'));
  const seen = new Map();          // ảnh lời hướng dẫn mục dùng chung cho nhiều câu: chỉ đổi một lần
  const img = async (fn) => {
    if (!fn) return null;
    const name = path.basename(fn);
    if (!seen.has(name)) {
      const p = path.join(out, name);
      seen.set(name, fsSync.existsSync(p) ? await toJpeg(job, p, name) : null);
    }
    return seen.get(name);
  };
  const questions = [];
  for (const q of raw.questions || []) {
    const opts = Array.isArray(q.options) ? q.options : [];
    let labels = Array.isArray(q.labels) && q.labels.length ? q.labels.map(String) : opts.map((_o, i) => String(i + 1));
    if (q.abcd) labels = labels.map((_l, i) => ABC(i));
    const mode = q.mode || 'image';
    const textual = mode === 'text';
    if (!textual && !labels.length) labels = ['1', '2', '3', '4'].slice(0, Math.max(3, opts.length || 4));
    // câu hiện bằng chữ: phương án là chữ; câu hiện bằng ảnh / tranh / chỉ nghe: phương án chỉ là nút số
    const options = textual
      ? opts.map((o, i) => ({ label: labels[i] || String(i + 1), value: String(o) }))
      : labels.map((l) => ({ label: l, value: l }));
    const ai = Number.isInteger(q.answer_index) ? q.answer_index : null;
    const images = [];
    if (textual) for (const f of q.images || []) { const u = await img(f); if (u) images.push(u); }
    const image = textual ? (images.shift() || null) : await img(q.crop);
    questions.push({
      id: q.id ?? null,
      section: String(q.section || ''),
      sectionImage: await img(q.section_crop),
      passage: q.passage ? String(q.passage) : '',
      passageImage: q.passage_mode === 'image' ? await img(q.passage_crop) : null,
      question: textual ? String(q.question || '') : '',
      image,
      images,
      options,
      correctAnswer: ai !== null && options[ai] ? options[ai].value : '',
      display: mode,
      review: {
        // ảnh gốc của câu, để admin chuyển câu hiện bằng chữ sang hiện ảnh nếu thấy chữ sai
        crop: textual ? await img(q.crop) : null,
        labels,
        reasons: (q.reasons || []).map((r) => String(r).replace(/\s*\[.*\]$/, '')),
        sectionCheck: q.section_check || [],
        passageCheck: q.passage_check || [],
        answerNote: q.answer_note || '',
        page: q.page ?? null
      }
    });
  }
  const pageImages = [];
  for (const p of raw.pages || []) {
    const src = path.join(out, 'ocr', `p${String(p).padStart(2, '0')}.png`);
    if (fsSync.existsSync(src)) pageImages.push({ page: p, url: await toJpeg(job, src, `page_${p}.png`, 1000) });
  }
  // mục nghe không in câu nào (đề không có bảng đáp án để biết số câu): admin nhập số câu khi duyệt
  const emptySections = [];
  for (const s of raw.empty_sections || []) {
    emptySections.push({
      section: String(s.section || ''),
      sectionImage: await img(s.section_crop),
      nOptions: Number(s.n_opt) || 3,
      page: s.page ?? null,
      sectionCheck: s.section_check || []
    });
  }
  const answered = questions.filter((q) => q.correctAnswer).length;
  return {
    emptySections,
    jobId: job.id,
    fileName: job.fileName,
    skill: job.skill,
    part: raw.part || null,
    answerLog: raw.answer_log || [],
    answersAttached: questions.length > 0 && answered === questions.length,
    timeLimitSec: job.skill === 'listening' ? 1800 : 3600,
    pageImages,
    questions
  };
}

/**
 * Khi lưu bài: chép đúng các ảnh câu hỏi đang dùng sang uploads/scan/<id>/ (thư mục công khai lâu dài),
 * đổi URL trong câu hỏi, rồi xoá thư mục phiên. Chỉ nhận ảnh thuộc chính phiên đó.
 */
export async function saveScanImages(jobId, questions) {
  if (!ID_RE.test(String(jobId || ''))) throw new Error('Phiên quét không hợp lệ');
  const src = jobDir(jobId);
  if (!fsSync.existsSync(src)) throw new Error('Phiên quét đã hết hạn hoặc đã lưu; hãy quét lại file đề');
  const dst = path.join(PUBLIC_DIR, jobId);
  await fs.mkdir(dst, { recursive: true });
  const prefix = `/uploads/scan-jobs/${jobId}/`;
  const move = async (url) => {
    if (!url) return null;
    if (!String(url).startsWith(prefix)) throw new Error('Ảnh không thuộc phiên quét này');
    const name = path.basename(String(url));
    if (!/^[\w.-]+\.jpg$/.test(name) || !fsSync.existsSync(path.join(src, name))) throw new Error(`Không thấy ảnh ${name}`);
    await fs.copyFile(path.join(src, name), path.join(dst, name));
    return `/uploads/scan/${jobId}/${name}`;
  };
  const out = [];
  for (const q of questions) {
    out.push({
      ...q,
      sectionImage: await move(q.sectionImage),
      passageImage: await move(q.passageImage),
      image: await move(q.image),
      images: await Promise.all((q.images || []).map(move))
    });
  }
  return out;
}

export async function finishScanJob(jobId) {
  jobs.delete(jobId);
  await fs.rm(jobDir(jobId), { recursive: true, force: true });
}

async function cleanupOldJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status !== 'running' && job.status !== 'queued' && now - job.createdAt > JOB_TTL_MS) await finishScanJob(id);
  }
  // thư mục phiên còn sót sau khi server khởi động lại (không còn trong bộ nhớ)
  if (!fsSync.existsSync(JOBS_DIR)) return;
  for (const name of await fs.readdir(JOBS_DIR)) {
    if (jobs.has(name)) continue;
    const st = await fs.stat(path.join(JOBS_DIR, name)).catch(() => null);
    if (st && now - st.mtimeMs > JOB_TTL_MS) await fs.rm(path.join(JOBS_DIR, name), { recursive: true, force: true });
  }
}
