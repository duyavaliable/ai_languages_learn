import { Exercise, Language } from '../models/index.js';
import { parseExerciseParts, extractQuestionsFromPart, extractPassageTextFromPart } from '../services/exerciseImportService.js';

const normalizeSkillType = (skill) => {
  if (!skill) return null;
  const value = String(skill).trim().toLowerCase();
  const supported = ['listening', 'speaking', 'reading', 'writing', 'vocabulary', 'grammar'];
  return supported.includes(value) ? value : null;
};

export const getExercises = async (req, res) => {
  try {
    const { courseId, skill, includeDeleted, lang } = req.query;
    const role = String(req.user?.role || '').toLowerCase();
    const where = {};

    // By default hide soft-deleted records. Admin can request full list.
    if (!(role === 'admin' && includeDeleted === 'true')) {
      where.is_deleted = false;
    }

    if (courseId) where.course_id = Number(courseId);

    if (skill) {
      const normalizedSkill = normalizeSkillType(skill);
      if (!normalizedSkill) {
        return res.status(400).json({ message: 'skill must be listening, speaking, reading, writing, vocabulary or grammar' });
      }
      where.skill_type = normalizedSkill;
    }

    // language filter: accept 'en'|'ja' or 'english'|'japanese'
    if (lang) {
      const code = String(lang || '').trim().toLowerCase();
      const map = { english: 'en', en: 'en', japanese: 'ja', ja: 'ja' };
      const want = map[code] || code;
      if (!want) {
        return res.status(400).json({ message: 'invalid lang value' });
      }
      const languageRow = await Language.findOne({ where: { code: want } });
      if (!languageRow) return res.status(400).json({ message: 'language not found' });
      where.language_id = Number(languageRow.id);
    }

    const exercises = await Exercise.findAll({
      where,
      include: [{ model: Language, as: 'language', attributes: ['id', 'name', 'code'] }],
      order: [['id', 'DESC']]
    });

    // normalize payload to include `language` as code for frontend convenience
    const rows = exercises.map((e) => {
      const obj = e.toJSON ? e.toJSON() : e;
      obj.language = obj.language?.code || null;
      return obj;
    });

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getExerciseById = async (req, res) => {
  try {
    const exercise = await Exercise.findOne({
      where: { id: req.params.id, is_deleted: false },
      include: [{ model: Language, as: 'language', attributes: ['id', 'name', 'code'] }]
    });

    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }

    if (String(exercise.skill_type || '').toLowerCase() === 'writing') {
      console.log('[getExerciseById] writing payload', {
        id: exercise.id,
        title: exercise.title,
        taskPromptLen: String(exercise.task_prompt || '').trim().length,
        readingPassageLen: String(exercise.reading_passage || '').trim().length,
        sampleAnswerLen: String(exercise.sample_answer || '').trim().length
      });
    }

    const payload = exercise.toJSON ? exercise.toJSON() : exercise;
    payload.language = payload.language?.code || null;
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * Sửa nội dung một bài (chỉ admin). Trường nào không gửi thì giữ nguyên.
 * `questions` là MẢNG ĐẦY ĐỦ, thay toàn bộ `questions_json` — trang sửa bài
 * gửi lại cả những trường nó không hiện (provenance, vstep_task...) nên dữ
 * liệu phụ không mất.
 */
export const updateExerciseContent = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, timeLimitSec, taskPrompt, sampleAnswer, readingPassage, questions } = req.body;

    const exercise = await Exercise.findOne({
      where: { id, is_deleted: false }
    });

    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }

    const updates = {};
    if (title !== undefined) {
      const t = String(title || '').trim();
      if (!t) return res.status(400).json({ message: 'Tiêu đề không được để trống' });
      updates.title = t.slice(0, 225);
    }
    if (timeLimitSec !== undefined) {
      const sec = Math.round(Number(timeLimitSec));
      if (!Number.isFinite(sec) || sec < 60) return res.status(400).json({ message: 'Thời gian làm bài tối thiểu 1 phút' });
      updates.time_limit_sec = sec;
    }
    if (taskPrompt !== undefined) updates.task_prompt = String(taskPrompt || '').trim();
    if (sampleAnswer !== undefined) updates.sample_answer = String(sampleAnswer || '').trim();
    if (readingPassage !== undefined) updates.reading_passage = String(readingPassage || '').trim();
    if (questions !== undefined) {
      if (!Array.isArray(questions)) {
        return res.status(400).json({ message: 'questions must be an array' });
      }
      updates.questions_json = JSON.stringify(questions);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    await exercise.update(updates);

    return res.json({
      message: 'Exercise content updated successfully',
      exercise
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const AUDIO_EXT = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a'
};

/**
 * Thay file nghe của một bài (chỉ admin). File mới lưu vào uploads/audio,
 * `audio_url` trỏ sang file mới. File cũ bị XOÁ nếu không còn bài nào khác
 * dùng — tránh đầy thư mục bằng file nghe sai.
 */
export const replaceExerciseAudio = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Chưa chọn file nghe' });
    const exercise = await Exercise.findOne({ where: { id: req.params.id, is_deleted: false } });
    if (!exercise) return res.status(404).json({ message: 'Exercise not found' });

    const fs = await import('fs/promises');
    const path = await import('path');
    const ext = AUDIO_EXT[req.file.mimetype] || 'mp3';
    const fname = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const targetDir = path.resolve('uploads', 'audio');
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, fname), req.file.buffer);

    const oldUrl = String(exercise.audio_url || '');
    await exercise.update({ audio_url: `/uploads/audio/${fname}` });

    if (oldUrl.startsWith('/uploads/audio/')) {
      const stillUsed = await Exercise.count({ where: { audio_url: oldUrl } });
      if (!stillUsed) {
        const oldPath = path.join(targetDir, path.basename(oldUrl));
        await fs.unlink(oldPath).catch(() => {});
      }
    }

    return res.json({ message: 'Đã cập nhật file nghe', audio_url: exercise.audio_url });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/** Khôi phục bài đã xoá mềm (chỉ admin). */
export const restoreExercise = async (req, res) => {
  try {
    const exercise = await Exercise.findOne({ where: { id: req.params.id, is_deleted: true } });
    if (!exercise) return res.status(404).json({ message: 'Không có bài đã xoá với id này' });
    await exercise.update({ is_deleted: false });
    return res.json({ message: 'Đã khôi phục bài', exerciseId: exercise.id });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const deleteExercise = async (req, res) => {
  try {
    const { id } = req.params;
    const role = String(req.user?.role || '').toLowerCase();

    const exercise = await Exercise.findOne({ where: { id } });
    if (!exercise) {
      // Chan doan cu doi chieu voi bang `lessons` da bo (xem models/index.js).
      return res.status(404).json({ message: 'Exercise not found' });
    }

    // Admin: two-step delete
    // 1st delete => soft delete
    // 2nd delete on already soft-deleted row => hard delete
    if (role === 'admin') {
      if (!exercise.is_deleted) {
        await exercise.update({ is_deleted: true });
        return res.json({
          message: 'Exercise soft deleted successfully',
          mode: 'soft',
          exerciseId: Number(id)
        });
      }

      await exercise.destroy();
      return res.json({
        message: 'Exercise deleted (hard) successfully',
        mode: 'hard',
        exerciseId: Number(id)
      });
    }

    return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const previewExerciseFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File is required' });
    const skill = req.body?.skill || req.query?.skill || 'speaking';
    const normalizedSkill = normalizeSkillType(skill) || 'speaking';
    const parsed = await parseExerciseParts(req.file, { skill: normalizedSkill });
    return res.json({ fileType: parsed.fileType, parts: parsed.parts || [], rawText: parsed.rawText || '' });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const createExercisesFromParts = async (req, res) => {
  try {
    const { course_id, exerciseTitle, skill } = req.body;
    // Resolve language from request: accept numeric language_id or code (en/ja/english/japanese)
    let resolvedLanguageId = null;
    let resolvedLanguageCode = 'en';
    const rawLangId = req.body.language_id || req.body.language || req.body.lang || req.query.lang || '';
    if (rawLangId) {
      const asNum = Number(rawLangId);
      if (Number.isFinite(asNum) && asNum > 0) {
        resolvedLanguageId = asNum;
        const languageRow = await Language.findOne({ where: { id: resolvedLanguageId } });
        resolvedLanguageCode = String(languageRow?.code || 'en').toLowerCase();
      } else {
        const code = String(rawLangId || '').trim().toLowerCase();
        const codeMap = { english: 'en', en: 'en', japanese: 'ja', ja: 'ja' };
        const want = codeMap[code] || code;
        const languageRow = await Language.findOne({ where: { code: want } });
        if (languageRow) {
          resolvedLanguageId = Number(languageRow.id);
          resolvedLanguageCode = String(languageRow.code || 'en').toLowerCase();
        }
      }
    }
    let parts = [];
    try {
      parts = req.body.parts ? (typeof req.body.parts === 'string' ? JSON.parse(req.body.parts) : req.body.parts) : [];
    } catch (_e) {
      return res.status(400).json({ message: 'Invalid parts payload' });
    }

    const normalizedSkill = normalizeSkillType(skill) || 'reading';

    let resolvedCourseId = Number(course_id);
    if (!Number.isFinite(resolvedCourseId) || resolvedCourseId <= 0) {
      const firstExercise = await Exercise.findOne({
        attributes: ['course_id'],
        where: { is_deleted: false },
        order: [['id', 'ASC']]
      });
      const fallbackCourseId = Number(firstExercise?.course_id);
      resolvedCourseId = Number.isFinite(fallbackCourseId) && fallbackCourseId > 0 ? fallbackCourseId : 1;
    }

    // handle optional audio upload (req.file) - save to uploads/audio like AI controller
    let audioUrl = null;
    if (req.file) {
      const fs = await import('fs/promises');
      const path = await import('path');
      const fname = `audio-${Date.now()}-${Math.random().toString(36).slice(2,9)}.${(req.file.mimetype||'audio').split('/').pop()}`;
      const targetDir = path.resolve('uploads', 'audio');
      await fs.mkdir(targetDir, { recursive: true });
      const targetPath = path.join(targetDir, fname);
      await fs.writeFile(targetPath, req.file.buffer);
      audioUrl = `/uploads/audio/${fname}`;
    }

    const created = [];

    for (let i = 0; i < parts.length; i += 1) {
      const p = parts[i] || {};
      // Tên bài do admin đặt; nhiều phần thì thêm "— Phần N (tiêu đề phần)" để các bài không trùng tên
      const base = String(exerciseTitle || 'Untitled').trim();
      const partName = String(p.title || '').trim().slice(0, 60);
      const name = parts.length > 1 ? `${base} — Phần ${i + 1}${partName ? ` (${partName})` : ''}` : base;

      const fullPartText = String(p.content || '').trim();
      const introText = extractPassageTextFromPart(fullPartText);
      const reading_passage = normalizedSkill === 'reading' ? (introText || null) : null;
      const task_prompt = (normalizedSkill === 'listening' || normalizedSkill === 'writing' || normalizedSkill === 'speaking')
        ? (introText || fullPartText || null)
        : null;
      const sample_answer = null;

      if (normalizedSkill === 'writing') {
        console.log('[createExercisesFromParts] writing part debug', {
          partIndex: i,
          fullPartTextLen: fullPartText.length,
          introTextLen: introText.length,
          taskPromptLen: String(task_prompt || '').trim().length,
          title: String(p.title || '').trim()
        });
      }
      
      // Đáp án chỉ lấy từ đề / bảng đáp án trong file; thiếu thì để trống (không đoán bằng AI).
      const questions = await extractQuestionsFromPart(fullPartText, { skill: normalizedSkill });

      // Writing prompt must be persisted in questions_json as requested.
      const questionsPayload = normalizedSkill === 'writing'
        ? [{ question: task_prompt || fullPartText, options: [], correctAnswer: '', explanation: '' }]
        : questions;
      const questions_json = JSON.stringify(questionsPayload);
      const time_limit_sec = (normalizedSkill === 'writing' || normalizedSkill === 'speaking') ? 900 : 300;

      const row = await Exercise.create({
        course_id: resolvedCourseId,
        language_id: resolvedLanguageId,
        title: name,
        skill_type: normalizedSkill,
        reading_passage,
        task_prompt,
        sample_answer,
        audio_url: audioUrl,
        questions_json,
        time_limit_sec,
        is_deleted: false
      });

      created.push({
        exerciseId: row.id,
        exerciseTitle: name,
        readingPassage: reading_passage,
        taskPrompt: task_prompt,
        questions: questionsPayload,
        questionCount: questionsPayload.length
      });

      if (normalizedSkill === 'writing') {
        console.log('[createExercisesFromParts] writing row created', {
          exerciseId: row.id,
          dbTaskPromptLen: String(row.task_prompt || '').trim().length
        });
      }
    }

    return res.json({ created });
  } catch (error) {
    console.error('[createExercisesFromParts] Error:', error);
    return res.status(500).json({ message: error.message });
  }
};

// ================= Đề PDF quét (scan / PDF chỉ có ảnh): Đọc / Nghe =================
// Bước 1: tải file đề (+ file đáp án nếu có) -> chạy quét NỀN, trả id phiên.
// Bước 2: trang admin hỏi tiến độ; xong thì nhận đề đã dựng để duyệt / sửa.
// Bước 3: lưu — chép ảnh câu hỏi sang thư mục lâu dài rồi tạo bài.

const isPdf = (f) => f && (/\.pdf$/i.test(f.originalname || '') || /pdf/i.test(f.mimetype || ''));
const PAGES_RE = /^\s*\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$/;

export const startScanExam = async (req, res) => {
  try {
    const file = req.files?.file?.[0];
    const key = req.files?.keyFile?.[0];
    if (!isPdf(file)) return res.status(400).json({ message: 'Chưa chọn file đề PDF' });
    if (key && !isPdf(key)) return res.status(400).json({ message: 'File đáp án phải là PDF' });
    const skill = normalizeSkillType(req.body.skill);
    if (!DOCX_SKILLS.includes(skill)) return res.status(400).json({ message: 'Quét đề PDF chỉ dùng cho kỹ năng Đọc hoặc Nghe' });
    const pages = String(req.body.pages || '').trim();
    const keyPages = String(req.body.keyPages || '').trim();
    if (pages && !PAGES_RE.test(pages)) return res.status(400).json({ message: 'Trang đề không hợp lệ (ví dụ: 3-16 hoặc 1,2,5-9)' });
    if (keyPages && !PAGES_RE.test(keyPages)) return res.status(400).json({ message: 'Trang đáp án không hợp lệ (ví dụ: 18 hoặc 1-2)' });

    let lang = 'ja';
    if (Number(req.body.language_id) > 0) {
      const row = await Language.findOne({ where: { id: Number(req.body.language_id) } });
      lang = String(row?.code || 'ja').toLowerCase();
    }
    const { startScanJob, OCR_LANG } = await import('../services/scanExamService.js');
    if (!OCR_LANG[lang]) return res.status(400).json({ message: `Bộ quét chưa hỗ trợ ngôn ngữ "${lang}"` });
    const jobId = await startScanJob({
      pdf: file.buffer, key: key?.buffer || null, pages, keyPages, skill, lang, fileName: file.originalname
    });
    return res.json({ jobId });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getScanExamStatus = async (req, res) => {
  const { getScanJob } = await import('../services/scanExamService.js');
  const job = getScanJob(req.params.id);
  if (!job) return res.status(404).json({ message: 'Không có phiên quét này (có thể server đã khởi động lại) — hãy quét lại' });
  return res.json(job);
};

// Bước duyệt: gắn file đáp án (hoặc trang đáp án trong file đề) cho phiên đã quét, đọc lại bảng đáp án
// trên kết quả OCR có sẵn — không quét lại đề.
export const attachScanKey = async (req, res) => {
  try {
    const key = req.file;
    if (key && !isPdf(key)) return res.status(400).json({ message: 'File đáp án phải là PDF' });
    const keyPages = String(req.body.keyPages || '').trim();
    if (keyPages && !PAGES_RE.test(keyPages)) return res.status(400).json({ message: 'Trang đáp án không hợp lệ (ví dụ: 18 hoặc 1-2)' });
    if (!key && !keyPages) return res.status(400).json({ message: 'Chọn file đáp án hoặc nhập trang đáp án trong file đề' });
    const { rescanWithKey } = await import('../services/scanExamService.js');
    const r = await rescanWithKey(req.params.id, { key: key?.buffer || null, keyPages });
    if (r.error) return res.status(r.status || 400).json({ message: r.error });
    return res.json({ jobId: req.params.id });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const cancelScanExam = async (req, res) => {
  const { cancelScanJob } = await import('../services/scanExamService.js');
  const ok = await cancelScanJob(req.params.id);
  return ok ? res.json({ message: 'Đã huỷ phiên quét' }) : res.status(404).json({ message: 'Không có phiên quét này' });
};

export const createScanExam = async (req, res) => {
  try {
    const skill = normalizeSkillType(req.body.skill);
    if (!DOCX_SKILLS.includes(skill)) return res.status(400).json({ message: 'Đề quét chỉ dùng cho kỹ năng Đọc hoặc Nghe' });
    const title = String(req.body.exerciseTitle || '').trim();
    if (!title) return res.status(400).json({ message: 'Chưa nhập tên bài' });
    let exam;
    try {
      exam = typeof req.body.exam === 'string' ? JSON.parse(req.body.exam) : req.body.exam;
    } catch (_e) {
      return res.status(400).json({ message: 'Dữ liệu đề không hợp lệ' });
    }
    const questions = Array.isArray(exam?.questions) ? exam.questions : [];
    if (!questions.length) return res.status(400).json({ message: 'Đề không có câu hỏi' });

    // Không lưu đề còn thiếu: mọi câu phải có nội dung (chữ hoặc ảnh), >= 2 phương án, đáp án là một phương án.
    const str = (v) => String(v ?? '');
    const problems = [];
    const audioFiles = Array.isArray(req.files) ? req.files : [];
    // nhiều file nghe: mỗi câu phải trỏ tới đúng một file (audioIndex); một file không gán = file chung cả đề
    const perQuestion = questions.some((q) => Number.isInteger(q.audioIndex));
    const clean = questions.map((q, i) => {
      const no = q.id || i + 1;
      const options = (Array.isArray(q.options) ? q.options : []).map((o, k) => ({
        label: str(o?.label || k + 1).trim().slice(0, 4),
        value: str(o?.value).trim()
      }));
      const answer = str(q.correctAnswer).trim();
      // Bài nghe: câu hỏi đọc trong băng, đề chỉ in phương án (chữ / tranh / số) -> không bắt buộc chữ câu hỏi.
      // Bài đọc: câu phải có chữ, ảnh, hoặc đoạn văn (câu điền chỗ trống nằm trong đoạn văn).
      // Giữ ĐÚNG điều kiện này ở màn duyệt (ScanExamReview) để admin không thấy "ổn" mà server lại từ chối.
      const hasContent = str(q.question).trim() || q.image || str(q.passage).trim() || q.passageImage;
      if (skill !== 'listening' && !hasContent) problems.push(`Câu ${no}: không có nội dung`);
      if (options.length < 2 || options.some((o) => !o.value)) problems.push(`Câu ${no}: phương án thiếu hoặc rỗng`);
      if (!options.some((o) => o.value === answer)) problems.push(`Câu ${no}: chưa chọn đáp án`);
      const ai = Number.isInteger(q.audioIndex) ? q.audioIndex : null;
      if (skill === 'listening' && perQuestion && (ai === null || ai < 0 || ai >= audioFiles.length)) {
        problems.push(`Câu ${no}: chưa gán file nghe`);
      }
      return {
        _audioIndex: ai,
        id: Number(q.id) || i + 1,
        section: str(q.section),
        sectionImage: q.sectionImage || null,
        passage: str(q.passage),
        passageImage: q.passageImage || null,
        question: str(q.question),
        image: q.image || null,
        images: Array.isArray(q.images) ? q.images.filter(Boolean) : [],
        options,
        correctAnswer: answer,
        display: ['text', 'image', 'picture', 'audio'].includes(q.display) ? q.display : 'text'
      };
    });
    if (problems.length) return res.status(400).json({ message: `Đề chưa sẵn sàng: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? '…' : ''}`, problems });
    if (skill === 'listening' && !audioFiles.length) return res.status(400).json({ message: 'Bài nghe cần file âm thanh' });
    if (skill === 'listening' && !perQuestion && audioFiles.length > 1) {
      return res.status(400).json({ message: 'Có nhiều file nghe nhưng chưa gán file cho từng câu' });
    }

    const { saveScanImages, finishScanJob } = await import('../services/scanExamService.js');
    const stored = await saveScanImages(req.body.jobId, clean);

    // lưu file nghe (mỗi file một lần, dù nhiều câu dùng chung)
    const fs = await import('fs/promises');
    const path = await import('path');
    const audioDir = path.resolve('uploads', 'audio');
    const audioUrls = [];
    if (skill === 'listening') {
      await fs.mkdir(audioDir, { recursive: true });
      for (const f of audioFiles) {
        // loại file trình duyệt gửi có khi rỗng / sai -> lấy theo đuôi tên file
        const ext = AUDIO_EXT[f.mimetype] || (String(f.originalname || '').match(/\.(mp3|wav|m4a|mp4|aac|ogg|oga|webm)$/i)?.[1] || 'mp3').toLowerCase();
        const fname = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
        await fs.writeFile(path.join(audioDir, fname), f.buffer);
        audioUrls.push(`/uploads/audio/${fname}`);
      }
    }
    for (const q of stored) {
      if (perQuestion && q._audioIndex !== null) {
        q.audio = audioUrls[q._audioIndex];
        q.audioName = str(audioFiles[q._audioIndex]?.originalname).slice(0, 200);
      }
      delete q._audioIndex;
    }

    let languageId = Number(req.body.language_id) > 0 ? Number(req.body.language_id) : null;
    if (!languageId) {
      const row = await Language.findOne({ where: { code: 'ja' } });
      languageId = row ? Number(row.id) : null;
    }
    let courseId = Number(req.body.course_id);
    if (!Number.isFinite(courseId) || courseId <= 0) {
      const first = await Exercise.findOne({ attributes: ['course_id'], where: { is_deleted: false }, order: [['id', 'ASC']] });
      courseId = Number(first?.course_id) > 0 ? Number(first.course_id) : 1;
    }
    // một file chung cho cả đề -> audio_url của bài; nhiều file -> nằm trong từng câu (`audio`)
    const audioUrl = !perQuestion && audioUrls.length === 1 ? audioUrls[0] : null;
    const timeLimit = Number(exam.timeLimitSec) > 0 ? Number(exam.timeLimitSec) : (skill === 'reading' ? 3600 : 1800);

    // Tách đề thành nhiều bài: mỗi PHẦN (các câu liền nhau cùng tiêu đề mục) một bài.
    const groups = [];
    for (const q of stored) {
      const last = groups[groups.length - 1];
      if (last && last.section === q.section) last.questions.push(q);
      else groups.push({ section: q.section, questions: [q] });
    }
    const split = String(req.body.split) === 'true' && groups.length > 1;
    let partTitles = [];
    try { partTitles = JSON.parse(req.body.partTitles || '[]'); } catch (_e) { partTitles = []; }
    // tên mặc định "… — Phần N" (không lấy chữ OCR của tiêu đề mục vào tên bài: có thể đọc sai)
    const parts = split
      ? groups.map((g, i) => ({
        title: (str(partTitles[i]).trim() || `${title} — Phần ${i + 1}`).slice(0, 250),
        questions: g.questions,
        // thời gian chia theo số câu của phần, ít nhất 5 phút
        time: Math.max(300, Math.round(timeLimit * g.questions.length / stored.length / 60) * 60)
      }))
      : [{ title, questions: stored, time: timeLimit }];

    const { default: sequelize } = await import('../config/database.js');
    const created = await sequelize.transaction(async (transaction) => {
      const out = [];
      for (const p of parts) {
        // cả bài dùng chung MỘT file nghe (vd mỗi phần một file) -> thành file nghe của bài, bỏ khỏi từng câu
        let partAudio = audioUrl;
        let qs = p.questions;
        const used = [...new Set(qs.map((q) => q.audio || null))];
        if (perQuestion && used.length === 1 && used[0]) {
          partAudio = used[0];
          qs = qs.map(({ audio, audioName, ...q }) => q);
        }
        const row = await Exercise.create({
          course_id: courseId,
          language_id: languageId,
          title: p.title,
          skill_type: skill,
          reading_passage: null,           // mỗi câu mang đoạn văn của nhóm mình (`passage`)
          task_prompt: null,
          sample_answer: null,
          audio_url: partAudio,
          questions_json: JSON.stringify(qs),
          time_limit_sec: p.time,
          source: str(req.body.sourceFile).slice(0, 500) || null,
          is_deleted: false
        }, { transaction });
        out.push({ exerciseId: row.id, exerciseTitle: p.title, questionCount: qs.length });
      }
      return out;
    });
    await finishScanJob(req.body.jobId);
    return res.json({ created });
  } catch (error) {
    console.error('[createScanExam] Error:', error);
    return res.status(500).json({ message: error.message });
  }
};

// ================= Đề trắc nghiệm dạng Word (.docx): Đọc / Nghe =================
// Bước 1 (xem trước): đọc cấu trúc đề + tự sửa lỗi gõ chắc chắn, KHÔNG lưu gì.
// Bước 2 (lưu): admin đã duyệt / sửa trên màn hình xem trước, gửi lại toàn bộ câu hỏi.

const DOCX_SKILLS = ['reading', 'listening'];

export const previewDocxExam = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Chưa chọn file đề' });
    const name = String(req.file.originalname || '').toLowerCase();
    if (!name.endsWith('.docx')) {
      return res.status(400).json({ message: 'Chỉ nhận file Word .docx (file .doc cũ hãy lưu lại thành .docx).' });
    }
    const { parseDocxExam } = await import('../services/docxExamService.js');
    const exam = parseDocxExam(req.file.buffer);
    return res.json({ fileName: req.file.originalname, ...exam });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const createDocxExam = async (req, res) => {
  try {
    const skill = normalizeSkillType(req.body.skill);
    if (!DOCX_SKILLS.includes(skill)) return res.status(400).json({ message: 'Đề Word chỉ dùng cho kỹ năng Đọc hoặc Nghe' });
    const title = String(req.body.exerciseTitle || '').trim();
    if (!title) return res.status(400).json({ message: 'Chưa nhập tên bài' });

    let exam;
    try {
      exam = typeof req.body.exam === 'string' ? JSON.parse(req.body.exam) : req.body.exam;
    } catch (_e) {
      return res.status(400).json({ message: 'Dữ liệu đề không hợp lệ' });
    }
    const questions = Array.isArray(exam?.questions) ? exam.questions : [];
    if (!questions.length) return res.status(400).json({ message: 'Đề không có câu hỏi' });

    // Không lưu đề còn thiếu: mọi câu phải có nội dung, >= 2 phương án và đáp án hợp lệ.
    const problems = [];
    const clean = questions.map((q, i) => {
      const options = (Array.isArray(q.options) ? q.options : []).map((o) => String(o ?? '').trim());
      const labels = options.map((_o, k) => String.fromCharCode(65 + k));
      const answer = String(q.correctAnswer || '').trim().toUpperCase();
      const no = q.id || i + 1;
      if (!String(q.question || '').trim() && !String(q.passage || '').trim()) problems.push(`Câu ${no}: trống`);
      if (options.length < 2 || options.some((o) => !o)) problems.push(`Câu ${no}: phương án thiếu hoặc rỗng`);
      if (!labels.includes(answer)) problems.push(`Câu ${no}: chưa chọn đáp án`);
      return {
        id: Number(q.id) || i + 1,
        section: String(q.section || ''),
        passage: String(q.passage || ''),
        question: String(q.question || ''),
        options,
        correctAnswer: answer,
        ...(q.level ? { level: Number(q.level) } : {})
      };
    });
    if (problems.length) return res.status(400).json({ message: `Đề chưa sẵn sàng: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? '…' : ''}`, problems });

    if (skill === 'listening' && !req.file) return res.status(400).json({ message: 'Bài nghe cần file âm thanh' });

    let languageId = null;
    const rawLang = req.body.language_id;
    if (rawLang && Number(rawLang) > 0) languageId = Number(rawLang);
    else {
      const row = await Language.findOne({ where: { code: 'en' } });
      languageId = row ? Number(row.id) : null;
    }
    let courseId = Number(req.body.course_id);
    if (!Number.isFinite(courseId) || courseId <= 0) {
      const first = await Exercise.findOne({ attributes: ['course_id'], where: { is_deleted: false }, order: [['id', 'ASC']] });
      courseId = Number(first?.course_id) > 0 ? Number(first.course_id) : 1;
    }

    let audioUrl = null;
    if (req.file) {
      const fs = await import('fs/promises');
      const path = await import('path');
      const ext = AUDIO_EXT[req.file.mimetype] || 'mp3';
      const fname = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
      const targetDir = path.resolve('uploads', 'audio');
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(path.join(targetDir, fname), req.file.buffer);
      audioUrl = `/uploads/audio/${fname}`;
    }

    const header = Array.isArray(exam.header) ? exam.header.filter(Boolean).join('\n') : '';
    const timeLimit = Number(exam.timeLimitSec) > 0 ? Number(exam.timeLimitSec) : (skill === 'reading' ? 3600 : 2400);
    const row = await Exercise.create({
      course_id: courseId,
      language_id: languageId,
      title,
      skill_type: skill,
      reading_passage: null,          // mỗi câu mang đoạn văn của nhóm mình (`passage`)
      task_prompt: header || null,
      sample_answer: null,
      audio_url: audioUrl,
      questions_json: JSON.stringify(clean),
      time_limit_sec: timeLimit,
      source: String(req.body.sourceFile || '').slice(0, 500) || null,
      is_deleted: false
    });
    return res.json({ created: [{ exerciseId: row.id, exerciseTitle: title, questionCount: clean.length }] });
  } catch (error) {
    console.error('[createDocxExam] Error:', error);
    return res.status(500).json({ message: error.message });
  }
};
