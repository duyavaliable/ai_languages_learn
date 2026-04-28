import { execSync } from 'child_process';
import { writeFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { parseVocabularyUpload } from './vocabularyImportService.js';

const tryRunCommand = (cmd) => {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch (err) {
    return false;
  }
};

const ocrImageBufferWithTesseract = async (buffer, lang = 'eng') => {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = createWorker();
    try {
      await worker.load();
      await worker.loadLanguage(lang);
      await worker.initialize(lang);
      const { data } = await worker.recognize(buffer);
      return String(data?.text || '').trim();
    } finally {
      try { await worker.terminate(); } catch (e) { }
    }
  } catch (err) {
    throw new Error('tesseract.js is not installed or failed to load');
  }
};

const performOcrUsingPdftoppm = async (pdfBuffer) => {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'pdfocr-'));
  const pdfPath = path.join(tmpDir, 'upload.pdf');
  writeFileSync(pdfPath, pdfBuffer);
  const outPrefix = path.join(tmpDir, 'page');

  const cmd = `pdftoppm -png -r 200 "${pdfPath}" "${outPrefix}"`;
  const ok = tryRunCommand(cmd);
  if (!ok) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw new Error('pdftoppm (poppler) is not available on the server');
  }

  const files = readdirSync(tmpDir).filter((f) => f.endsWith('.png'))
    .map((f) => path.join(tmpDir, f))
    .sort();

  const parts = [];
  for (const filePath of files) {
    const buf = readFileSync(filePath);
    const txt = await ocrImageBufferWithTesseract(buf);
    if (txt) parts.push(txt);
  }

  rmSync(tmpDir, { recursive: true, force: true });
  return parts.join('\n');
};

// Rule-based regex cleanup: Fix spacing issues in OCR'd text
const fixSpacing = (text) => {
  if (!text) return text;
  return String(text)
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase spacing: textBase -> text Base
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')  // ABc spacing: ABc -> A Bc
    .replace(/(\d)([A-Za-z])/g, '$1 $2')  // number to letter: 1st -> 1 st
    .replace(/([A-Za-z])(\d)/g, '$1 $2')  // letter to number: a1 -> a 1
    .replace(/\s+/g, ' ')  // collapse multiple spaces
    .trim();
};

const extractRelevantParts = (rawText) => {
  if (!rawText) return [];
  const lines = String(rawText || '').split(/\r?\n/).map((l) => l.trim());
  const filtered = lines.filter((l) => {
    if (!l) return false;
    if (/^page\b\s*\d+/i.test(l)) return false;
    if (/^\d+$/.test(l)) return false;
    if (/^\-+$/i.test(l)) return false;
    if (/^\*{2,}$/.test(l)) return false;
    return true;
  }).join('\n');

  const regex = /^part\s*[ivx\d]+[\s:\-].*?(?=^part\s*[ivx\d]+[\s:\-]|\z)/gims;
  const matches = [...String(filtered).matchAll(regex)].map((m) => m[0].trim());
  if (matches.length) {
    return matches.map((text) => {
      const firstLine = (String(text).split(/\r?\n/)[0] || '').trim();
      return { title: fixSpacing(firstLine), content: fixSpacing(text) };
    });
  }

  const regex2 = /^PART\s+[IVX\d]+[:\s\-].*?(?=^PART\s+[IVX\d]+[:\s\-]|\z)/gms;
  const matches2 = [...String(filtered).matchAll(regex2)].map((m) => m[0].trim());
  if (matches2.length) {
    return matches2.map((text) => {
      const firstLine = (String(text).split(/\r?\n/)[0] || '').trim();
      return { title: fixSpacing(firstLine), content: fixSpacing(text) };
    });
  }

  return [];
};

export const parseExerciseParts = async (file) => {
  // Reuse existing parser to extract rawText/table rows
  const parsed = await parseVocabularyUpload(file);

  let raw = String(parsed.rawText || '');

  if (parsed.fileType === 'pdf') {
    const rawLen = raw.trim().length;
    if (rawLen < 50 && (!parsed.tableRows || parsed.tableRows.length === 0)) {
      try {
        const ocrText = await performOcrUsingPdftoppm(file.buffer);
        if (ocrText && ocrText.trim().length > rawLen) {
          raw = ocrText;
        }
      } catch (err) {
        // OCR unavailable -> continue with original raw
      }
    }
  }

  const parts = extractRelevantParts(raw);
  return {
    fileType: parsed.fileType,
    rawText: raw,
    parts
  };
};

export default null;
