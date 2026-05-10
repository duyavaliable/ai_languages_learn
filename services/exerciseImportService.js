import { execSync } from 'child_process';
import { writeFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path, { normalize } from 'path';
import { parseVocabularyUpload } from './vocabularyImportService.js';
import sharp from 'sharp';

import { generateGeminiText } from './aiService.js';

const tryRunCommand = (cmd) => {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch (err) {
    return false;
  }
};

const ocrImageBufferWithTesseract = async (buffer, lang = 'eng', options = {}) => {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = createWorker();
    try {
      await worker.load();
      await worker.loadLanguage(lang);
      await worker.initialize(lang);

      // Try a small set of conservative configurations and pick the best using a
      // lightweight scoring function that penalizes outputs with many isolated
      // single-letter sequences or repeated extra spaces (common OCR spacing artifacts).
      const configs = [];
      // Allow forcing via env/options; otherwise try preferred list
      if (process.env.TESS_PSM || options.psm) {
        configs.push({ psm: process.env.TESS_PSM || options.psm, preserve_interword_spaces: process.env.TESS_PRESERVE_INTERWORD_SPACES || options.preserveInterwordSpaces || '0' });
      } else {
        // order matters: try PSM 6, 4, 3 (6 is single block, 4 is single column, 3 is fully automatic)
        configs.push({ psm: '6', preserve_interword_spaces: process.env.TESS_PRESERVE_INTERWORD_SPACES || options.preserveInterwordSpaces || '1' });
        configs.push({ psm: '4', preserve_interword_spaces: process.env.TESS_PRESERVE_INTERWORD_SPACES || options.preserveInterwordSpaces || '1' });
        configs.push({ psm: '3', preserve_interword_spaces: process.env.TESS_PRESERVE_INTERWORD_SPACES || options.preserveInterwordSpaces || '1' });
        configs.push({ psm: '11', preserve_interword_spaces: '1' });
      }

      const userDpi = process.env.TESS_USER_DPI || options.userDpi || '300';

      const scoreOutput = (txt) => {
        if (!txt) return Number.POSITIVE_INFINITY;
        // penalty for sequences like "S O C I A L" (multiple single letters separated by spaces)
        const singleLetterSeq = (txt.match(/(?:\b[A-Za-z]\s+){2,}[A-Za-z]\b/g) || []).length;
        // penalty for repeated multi-spaces
        const multiSpaces = (txt.match(/ {2,}/g) || []).length;
        // penalty for many short isolated letter-space patterns inside words (e.g., "t r a n s p o r t")
        const shortSplit = (txt.match(/[A-Za-z]\s+[A-Za-z]\s+[A-Za-z]/g) || []).length;
        // penalty for glued words (e.g., "hello world" becomes "helloworld")
        const gluedWords = (txt.match(/\b[A-Za-z]+\b/g) || []).filter((w) => w.length > 10).length;
        // lower is better
        return singleLetterSeq * 5 + shortSplit * 3 + multiSpaces * 2 + gluedWords * 4 - Math.min(0, Math.floor(txt.length / 100));
      };

      let best = { text: '', score: Number.POSITIVE_INFINITY };
      for (const cfg of configs) {
        try {
          try {
            await worker.setParameters({
              tessedit_pageseg_mode: String(cfg.psm),
              preserve_interword_spaces: String(cfg.preserve_interword_spaces || '1'),
              user_defined_dpi: String(userDpi)
            });
          } catch (e) {
            // ignore if setParameters not available
          }

          const processedBuffer = await sharp(buffer)
            .resize({ width: 2500 })
            .threshold(150)
            .sharpen()
            .grayscale()
            .normalize()
            .toBuffer();
          const { data } = await worker.recognize(processedBuffer)
          const txt = String(data?.text || '').trim();
          const sc = scoreOutput(txt);
          if (sc < best.score || (sc === best.score && txt.length > (best.text || '').length)) {
            best = { text: txt, score: sc };
          }
        } catch (e) {
          // per-config failure -> continue
        }
      }

      return String(best.text || '').trim();
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

const OCR_GLUED_WORDS = [
  'about', 'activities', 'activity', 'again', 'answer', 'because', 'before', 'books', 'channel',
  'choose', 'day', 'discussion', 'exercise', 'free', 'friends', 'future', 'great', 'here', 'house',
  'interesting', 'lesson', 'like', 'long', 'maybe', 'more', 'most', 'neighborhood', 'often', 'people',
  'plan', 'question', 'read', 'school', 'something', 'sometimes', 'study', 'talk', 'there', 'these',
  'they', 'think', 'time', 'today', 'watch', 'week', 'what', 'when', 'where', 'which', 'who', 'why',
  'with', 'without', 'work', 'would', 'your', 'yours', 'you', 'yes', 'no', 'not', 'can', 'could',
  'should', 'will', 'and', 'or', 'but', 'for', 'from', 'into', 'over', 'under', 'around',
  'best', 'live', 'love', 'make', 'need', 'want', 'write', 'tell', 'much', 'many', 'every',
  'game', 'games', 'movie', 'movies', 'music', 'sport', 'sports', 'travel', 'city', 'village'
];

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const splitGluedWords = (text) => {
  let output = String(text || '');
  const words = [...new Set(OCR_GLUED_WORDS)]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  for (const word of words) {
    const pattern = new RegExp(`([\\p{L}])(?=${escapeRegExp(word)}\\b)`, 'giu');
    output = output.replace(pattern, '$1 ');
  }

  return output;
};

const normalizeOcrLine = (text) => String(text || '')
  .replace(/\u00A0/g, ' ')
  // Fix common OCR split words like "F or" -> "For", "T here" -> "There"
  .replace(/\b([A-Z])\s+([a-z]{2,})\b/g, '$1$2')
  // Fix a few high-frequency split tokens seen in scanned tests
  .replace(/\bpia\s+no\b/gi, 'piano')
  .replace(/\bC\s+Ds\b/g, 'CDs')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
  .replace(/(\d)([A-Za-z])/g, '$1 $2')
  .replace(/([A-Za-z])(\d)/g, '$1 $2')
  // split common glued verb+you+word patterns like "doyoulike" -> "do you like"
  .replace(/\b(do|did|does|can|could|would|should|have|had|will|shall|must)(you)([A-Za-z]{3,})\b/gi, '$1 $2 $3')
  .replace(/\s*:\s*/g, ': ')
  .replace(/\s*,\s*/g, ', ')
  .replace(/\s*;\s*/g, '; ')
  .replace(/\s*\?\s*/g, '? ')
  .replace(/\s*!\s*/g, '! ')
  .replace(/\s*\(\s*/g, ' (')
  .replace(/\s*\)\s*/g, ') ')
  .replace(/\s*-\s*/g, ' - ')
  .replace(/\s+/g, ' ')
  .trim();

const isPartHeaderLine = (line) => /^part\s*[ivx\d]+[\s:\-]/i.test(line);
const normalizeHeadingLine = (line) => String(line || '').replace(/\s+/g, ' ').trim();
const isReadingHeadingLine = (line) => /^passage\s*\d+(\s*[\-–—]\s*questions?\s*\d+\s*[\-–—]\s*\d+)?$/i.test(normalizeHeadingLine(line));
const isBulletLine = (line) => /^[-•*]\s*/.test(line);
const QUESTION_CONTINUATION_STARTERS = /^(if|why|what|where|when|who|whom|which|how|do|does|did|can|could|should|would|will|have|has|had|is|are|was|were)\b/i;

// Nhận biết dấu hiệu bắt đầu câu/ý mới: gạch ngang, chấm, số
const isNewSentenceMarker = (line) => {
  const trimmed = String(line || '').trim();
  return /^[-•*]\s+\S/.test(trimmed) ||  // Gạch ngang/chấm: "- What", "• Do you"
    /^\d+[\.\)]\s+\S/.test(trimmed) ||  // Số: "1. Do you", "2) What"
    /^[0-9]+\s+[A-Za-z]/.test(trimmed);  // Số rồi chữ: "1 Do you"
};

const shouldMergeWithPreviousLine = (line, previousLine) => {
  if (!line || !previousLine) return false;

  // Nếu dòng hiện tại là dấu hiệu câu mới -> không ghép
  if (isNewSentenceMarker(line)) return false;

  // Nếu dòng hiện tại là header hoặc bullet -> không ghép
  if (isPartHeaderLine(line)) return false;

  // Nếu dòng trước kết thúc bằng ? hoặc : và dòng hiện tại bắt đầu với từ hỏi -> ghép
  if (previousLine.endsWith('?') || previousLine.endsWith(':')) {
    return QUESTION_CONTINUATION_STARTERS.test(line);
  }

  // Nếu dòng trước là bullet và dòng hiện tại bắt đầu với từ hỏi -> ghép
  if (/^-\s/.test(previousLine)) {
    return QUESTION_CONTINUATION_STARTERS.test(line);
  }

  return false;
};

const extractReadingParts = (rawText) => {
  if (!rawText) return [];

  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^page\b\s*\d+/i.test(line)) return false;
      if (/^\d+$/.test(line)) return false;
      if (/^\-+$/i.test(line)) return false;
      if (/^\*{2,}$/.test(line)) return false;
      return true;
    });

  const passages = [];
  let currentTitle = '';
  let currentLines = [];

  const pushPassage = () => {
    const content = currentLines.join('\n').trim();
    if (currentTitle || content) {
      passages.push({
        title: fixSpacing(currentTitle || 'PASSAGE'),
        content: fixSpacing([currentTitle, ...currentLines].filter(Boolean).join('\n'), { preserveLineBreaks: true }),
        skill: 'reading'
      });
    }
    currentTitle = '';
    currentLines = [];
  };

  for (const line of lines) {
    if (isReadingHeadingLine(line)) {
      if (currentTitle || currentLines.length > 0) {
        pushPassage();
      }
      currentTitle = line;
      continue;
    }

    if (!currentTitle) {
      // Ignore leading noise until the first PASSAGE heading appears.
      continue;
    }

    currentLines.push(line);
  }

  pushPassage();
  return passages;
};

// Rule-based regex cleanup: Fix spacing issues in OCR'd text
const fixSpacing = (text, options = {}) => {
  if (!text) return text;

  const { preserveLineBreaks = false } = options;
  const lines = String(text)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => normalizeOcrLine(splitGluedWords(line)));

  if (!preserveLineBreaks) {
    return lines.filter((line) => line.length > 0).join(' ').replace(/\s+/g, ' ').trim();
  }

  const blocks = [];
  let currentBlock = '';
  let previousLine = '';

  const pushBlock = () => {
    const cleaned = currentBlock.replace(/\s+/g, ' ').trim();
    if (cleaned) {
      blocks.push(cleaned);
    }
    currentBlock = '';
  };

  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line) {
      pushBlock();
      previousLine = '';
      continue;
    }

    if (isPartHeaderLine(line)) {
      pushBlock();
      blocks.push(line);
      previousLine = line;
      continue;
    }

    if (isBulletLine(line)) {
      pushBlock();
      currentBlock = line.replace(/^[-•*]\s*/, '- ');
      previousLine = currentBlock;
      continue;
    }

    if (currentBlock && shouldMergeWithPreviousLine(line, previousLine)) {
      currentBlock = `${currentBlock} ${line}`.trim();
      previousLine = line;
      continue;
    }

    if (currentBlock) {
      pushBlock();
    }

    currentBlock = line;
    previousLine = line;
  }

  pushBlock();
  return blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const extractRelevantParts = (rawText, options = {}) => {
  if (!rawText) return [];
  const skill = options.skill || 'speaking';

  // Section heading patterns: robustly detect many common exam headings
  // Old pattern was too strict; use a looser heading matcher and then slice
  // the document from each heading index to the next heading index.
  const sectionRegex = /^\s*(PART|PASSAGE|SECTION|TASK|TOPIC|SITUATION|QUESTION)\s*[IVX\d]+\.?[\s:\-]?/gim;
  const lines = String(rawText || '').split(/\r?\n/).map((l) => l.trim());
  const filtered = lines.filter((l) => {
    if (!l) return false;
    if (/^page\b\s*\d+/i.test(l)) return false;
    if (/^\d+$/.test(l)) return false;
    if (/^\-+$/i.test(l)) return false;
    if (/^\*{2,}$/.test(l)) return false;
    return true;
  }).join('\n');

  // Try to split by section headings using heading indices so we capture
  // the full text for each section (heading + body) even when headings
  // vary in formatting.
  const matchIter = String(filtered).matchAll(sectionRegex);
  const matches = [...matchIter];
  if (matches.length) {
    const sections = [];
    for (let i = 0; i < matches.length; i += 1) {
      const start = typeof matches[i].index === 'number' ? matches[i].index : 0;
      const end = (i + 1 < matches.length && typeof matches[i + 1].index === 'number')
        ? matches[i + 1].index
        : filtered.length;
      const sectionText = String(filtered).slice(start, end).trim();
      if (sectionText) sections.push(sectionText);
    }

    return sections.map((text) => {
      const firstLine = (String(text).split(/\r?\n/)[0] || '').trim();
      return {
        title: fixSpacing(firstLine),
        content: fixSpacing(text, { preserveLineBreaks: true }),
        skill
      };
    });
  }

  // If no section found, treat the whole file as one part
  return [{
    title: '',
    content: fixSpacing(filtered, { preserveLineBreaks: true }),
    skill
  }];
};

const WRITING_MARKER_REGEX = /you\s*should\s*spend\s*20\s*minutes\s*on\s*this\s*task\.?/i;
const WRITING_STOP_REGEX = /(?:you\s*should\s*write\s*at\s*least|write\s*at\s*least)\s*\d+\s*(?:[-–—]\s*\d+)?\s*words?\.?/i;

const buildWritingCandidates = (rawText) => {
  const normalized = fixSpacing(String(rawText || ''), { preserveLineBreaks: true });
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length >= 20)
    .map((block, index) => ({
      id: index + 1,
      title: `Đoạn ${index + 1}`,
      content: block,
      skill: 'writing'
    }));

  return blocks.slice(0, 8);
};

const extractWritingPromptByMarker = (rawText) => {
  const source = String(rawText || '').replace(/\r/g, '').trim();
  if (!source) {
    return {
      markerFound: false,
      prompt: '',
      candidates: buildWritingCandidates(rawText)
    };
  }

  const markerMatch = source.match(WRITING_MARKER_REGEX);
  if (!markerMatch || typeof markerMatch.index !== 'number') {
    return {
      markerFound: false,
      prompt: '',
      candidates: buildWritingCandidates(rawText)
    };
  }

  const markerEnd = markerMatch.index + markerMatch[0].length;
  let tail = source.slice(markerEnd).trim();

  const stopMatch = tail.match(WRITING_STOP_REGEX);
  if (stopMatch && typeof stopMatch.index === 'number') {
    tail = tail.slice(0, stopMatch.index).trim();
  }

  // Remove list bullets/leading punctuation noise while preserving line breaks for UI readability.
  const prompt = fixSpacing(
    tail
      .replace(/^[\s:\-–—]+/, '')
      .replace(/[•·]/g, '- '),
    { preserveLineBreaks: true }
  );

  const hasPrompt = Boolean(prompt && prompt.length >= 10);
  return {
    markerFound: true,
    prompt: hasPrompt ? prompt : '',
    candidates: hasPrompt
      ? [{ id: 1, title: 'Writing prompt (auto)', content: prompt, skill: 'writing' }]
      : buildWritingCandidates(rawText)
  };
};

// Extract questions/options/correct answer from a part (for both listening/reading)
export async function extractQuestionsFromPart(text, options = {}) {
  if (!text) return [];

  const { skill = 'listening', useAiForAnswers = false, language = 'en' } = options;
  const passageContext = extractPassageTextFromPart(text);
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const questions = [];
  let i = 0;

  // New: Check for a dedicated answer key section
  const answerKey = parseAnswerKey(text);

  while (i < lines.length) {
    // Question: starts with number and dot/parenthesis
    const qMatch = lines[i].match(/^\s*(\d+)\s*[\.)]\s*(.+)$/);
    if (qMatch) {
      const qNumber = qMatch[1];
      const qTextParts = [qMatch[2] || ''];
      const currentOptions = [];
      let correctAnswer = null;
      i += 1;
      let optionLetter = 'A';

      while (i < lines.length) {
        // Option formats: A. text | A) text | (A) text | (A.) text | (C.) text
        const optMatch = lines[i].match(/^\s*(\(?\s*([A-Da-d])\s*\)?\.?\)?)\s*(.+)$/);
        if (optMatch) {
          const optText = String(optMatch[3] || '').trim();
          const fullLine = lines[i].trim();

          // Detect correct answer markers: (A) / (B.) / (C) at start of line
          const isMarkedCorrect = /^\(\s*[A-Da-d]\s*\.?\s*\)/.test(fullLine);

          if (isMarkedCorrect) {
            correctAnswer = optText;
          }
          currentOptions.push(optText);
          optionLetter = String.fromCharCode(optionLetter.charCodeAt(0) + 1);
          i += 1;
          continue;
        }

        // Next question
        const nextQMatch = lines[i].match(/^\s*\d+\s*[\.)]\s*/);
        if (nextQMatch) break;
        // If line looks like continuation of question text
        if (currentOptions.length === 0) {
          qTextParts.push(lines[i]);
          i += 1;
          continue;
        }
        break;
      }

      const questionText = qTextParts.join(' ').trim();

      // If no correct answer found in-line, check the answer key
      if (!correctAnswer && answerKey[qNumber]) {
        const correctLetter = answerKey[qNumber];
        const correctIndex = correctLetter.charCodeAt(0) - 'A'.charCodeAt(0);
        if (correctIndex >= 0 && correctIndex < currentOptions.length) {
          correctAnswer = currentOptions[correctIndex];
        }
      }

      // For reading skill, if still no answer, use AI
      if (skill === 'reading' && !correctAnswer && useAiForAnswers && currentOptions.length > 0) {
        try {
          correctAnswer = await findCorrectAnswerWithAi(questionText, currentOptions, passageContext, language);
        } catch (aiError) {
          console.error(`[AI Answer] Failed for question "${questionText.substring(0, 50)}...":`, aiError.message);
        }
      }

      questions.push({ question: questionText, options: currentOptions, correctAnswer });
      continue;
    }
    i += 1;
  }
  return questions;
}

// New helper to parse a block like "Đáp án: 1.A 2.B 3.C"
const parseAnswerKey = (text) => {
  const key = {};
  const answerBlockMatch = text.match(/(?:^|\n)\s*(đáp\s*án|answers?)\s*:/i);
  if (!answerBlockMatch) return key;

  const answerLines = text.slice(answerBlockMatch.index + answerBlockMatch[0].length).split(/\r?\n/);
  for (const line of answerLines) {
    const matches = [...line.matchAll(/(\d+)\s*[\.\-:]?\s*([A-Da-d])\b/g)];
    for (const match of matches) {
      const qNum = match[1];
      const ansLetter = String(match[2] || '').toUpperCase();
      if (qNum && ansLetter) {
        key[qNum] = ansLetter;
      }
    }
  }
  return key;
};

// New helper to use AI for finding the correct answer
const findCorrectAnswerWithAi = async (question, options, passageContext = '', language = 'en') => {
  const isJapanese = String(language || '').toLowerCase().startsWith('ja');
  const systemInstruction = isJapanese
    ? 'You are an expert in Japanese reading comprehension. Your task is to identify the single best answer for a multiple-choice question based on the provided context. The user will provide a question and a list of options. You must choose one of the provided options. Respond with only the exact text of the correct option, and nothing else. Do not add any explanation or introductory text.'
    : 'You are an expert in English language and reading comprehension. Your task is to identify the single best answer for a multiple-choice question based on the provided context. The user will provide a question and a list of options. You must choose one of the provided options. Respond with only the exact text of the correct option, and nothing else. Do not add any explanation or introductory text.';

  const userPrompt = `${isJapanese ? 'Japanese' : 'Reading'} passage/context:
"${String(passageContext || '').trim()}"

Question: "${question}"

Options:
${options.map((opt, i) => `- ${opt}`).join('\n')}

Based on general knowledge and the context implied by the question, which option is the most logical and correct answer? Respond with the full text of that option only.`;

  const result = await generateGeminiText({
    systemInstruction,
    userPrompt,
    temperature: 0.1,
    maxOutputTokens: 50
  });

  const aiAnswer = String(result || '').trim();
  // Find the closest match in the original options to avoid hallucinations
  const bestMatch = options.find(opt => aiAnswer.includes(opt) || opt.includes(aiAnswer));

  return bestMatch || null;
};


export function extractPassageTextFromPart(text) {
  const source = String(text || '').trim();
  if (!source) return '';
  // Keep intro/passage only; drop question block from first numbered question line.
  const firstQuestionIndex = source.search(/(?:^|\n)\s*\d+\s*[\.)]\s+/m);
  const passage = firstQuestionIndex >= 0 ? source.slice(0, firstQuestionIndex) : source;
  return passage.trim();
}

export const parseExerciseParts = async (file, options = {}) => {
  // Reuse existing parser to extract rawText/table rows
  const parsed = await parseVocabularyUpload(file);
  const skill = options.skill || 'speaking';
  const useOcrForPdf = options.useOcrForPdf !== false;

  let raw = String(parsed.rawText || '');

  // DOCX/TXT: always text parser only, never OCR
  if (parsed.fileType !== 'pdf') {
    if (skill === 'writing') {
      const writingParsed = extractWritingPromptByMarker(raw);
      const parts = writingParsed.markerFound && writingParsed.prompt
        ? [{ title: 'Writing prompt (auto)', content: writingParsed.prompt, skill: 'writing' }]
        : [];
      return {
        fileType: parsed.fileType,
        rawText: raw,
        skill,
        parts,
        writingMeta: {
          markerFound: writingParsed.markerFound,
          detectedPrompt: writingParsed.prompt,
          requiresManualConfirm: !writingParsed.markerFound,
          candidates: writingParsed.candidates
        }
      };
    }

    const parts = skill === 'reading'
      ? extractReadingParts(raw)
      : extractRelevantParts(raw, { skill });
    return {
      fileType: parsed.fileType,
      rawText: raw,
      skill,
      parts
    };
  }

  // PDF only: optional OCR fallback when extracted text is too short
  if (parsed.fileType === 'pdf' && useOcrForPdf) {
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

  if (skill === 'writing') {
    const writingParsed = extractWritingPromptByMarker(raw);
    const parts = writingParsed.markerFound && writingParsed.prompt
      ? [{ title: 'Writing prompt (auto)', content: writingParsed.prompt, skill: 'writing' }]
      : [];
    return {
      fileType: parsed.fileType,
      rawText: raw,
      skill,
      parts,
      writingMeta: {
        markerFound: writingParsed.markerFound,
        detectedPrompt: writingParsed.prompt,
        requiresManualConfirm: !writingParsed.markerFound,
        candidates: writingParsed.candidates
      }
    };
  }

  const parts = skill === 'reading'
    ? extractReadingParts(raw)
    : extractRelevantParts(raw, { skill });
  return {
    fileType: parsed.fileType,
    rawText: raw,
    skill,
    parts
  };
};

export default null;
