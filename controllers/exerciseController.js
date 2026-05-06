import { Exercise, Lesson, Language } from '../models/index.js';
import { parseExerciseParts, extractQuestionsFromPart, extractPassageTextFromPart } from '../services/exerciseImportService.js';
import { generateGeminiText } from '../services/aiService.js';

const normalizeSkillType = (skill) => {
  if (!skill) return null;
  const value = String(skill).trim().toLowerCase();
  const supported = ['listening', 'speaking', 'reading', 'writing', 'vocabulary', 'grammar'];
  return supported.includes(value) ? value : null;
};

const extractPromptFromQuestionsJson = (questionsJson) => {
  try {
    const parsed = JSON.parse(String(questionsJson || '[]'));
    if (!Array.isArray(parsed) || parsed.length === 0) return '';
    const first = parsed[0] || {};
    if (typeof first?.prompt === 'string' && first.prompt.trim()) return first.prompt.trim();
    if (typeof first?.question === 'string' && first.question.trim()) return first.question.trim();
    return '';
  } catch (_err) {
    return '';
  }
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

export const updateExerciseContent = async (req, res) => {
  try {
    const { id } = req.params;
    const { taskPrompt, sampleAnswer, readingPassage, questions } = req.body;

    const exercise = await Exercise.findOne({
      where: { id, is_deleted: false }
    });

    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }

    const updates = {};
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

export const deleteExercise = async (req, res) => {
  try {
    const { id } = req.params;
    const role = String(req.user?.role || '').toLowerCase();

    const exercise = await Exercise.findOne({ where: { id } });
    if (!exercise) {
      // Helpful diagnostic: sometimes client accidentally sends lesson id.
      const lesson = await Lesson.findOne({ where: { id, is_deleted: false } });
      if (lesson) {
        return res.status(400).json({ message: 'ID này thuộc lesson, không phải exercise. Hãy mở đúng bài tập (exercise) để xóa.' });
      }
      return res.status(404).json({ message: 'Exercise not found' });
    }

    // Teacher: soft delete only
    if (role === 'teacher') {
      if (exercise.is_deleted) {
        return res.json({
          message: 'Exercise already soft deleted',
          mode: 'soft',
          exerciseId: Number(id)
        });
      }

      await exercise.update({ is_deleted: true });
      return res.json({
        message: 'Exercise deleted (soft) successfully',
        mode: 'soft',
        exerciseId: Number(id)
      });
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
      // Use only the user-provided exerciseTitle as the exercise name
      const name = String(exerciseTitle || 'Untitled').trim();

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
      
      // Parse questions, using AI for reading answers if needed
      const questions = await extractQuestionsFromPart(fullPartText, {
        skill: normalizedSkill,
        useAiForAnswers: normalizedSkill === 'reading',
        language: resolvedLanguageCode
      });

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

export const generateWritingAssist = async (req, res) => {
  try {
    const { id } = req.params;
    const { submissionText = '', includeSampleAnswer = false } = req.body || {};

    const exercise = await Exercise.findOne({
      where: { id, is_deleted: false }
    });

    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }

    if (String(exercise.skill_type || '').toLowerCase() !== 'writing') {
      return res.status(400).json({ message: 'This endpoint is only for writing exercises' });
    }

    const promptFromQuestions = extractPromptFromQuestionsJson(exercise.questions_json);
    const taskPrompt = String(exercise.task_prompt || promptFromQuestions || exercise.reading_passage || '').trim();
    if (!taskPrompt) {
      return res.status(400).json({ message: 'Writing prompt is empty for this exercise' });
    }

    const systemInstruction = [
      'You are an IELTS/CEFR writing coach.',
      'Return strict JSON only.',
      'JSON object keys: structureTips (array of exactly 4 short strings), sampleAnswer (string).',
      'If includeSampleAnswer is false then sampleAnswer must be empty string.',
      'Keep tips concise and practical.'
    ].join(' ');

    const userPrompt = [
      `Task prompt: ${taskPrompt}`,
      `Student submission (optional): ${String(submissionText || '').trim()}`,
      `includeSampleAnswer: ${Boolean(includeSampleAnswer)}`,
      'Generate writing guidance for this exact prompt.'
    ].join('\n');

    const aiRaw = await generateGeminiText({
      systemInstruction,
      userPrompt,
      temperature: 0.3,
      maxOutputTokens: 900,
      forceJsonOutput: true
    });

    let parsed;
    try {
      parsed = JSON.parse(aiRaw);
    } catch (_err) {
      return res.status(500).json({ message: 'AI response is not valid JSON' });
    }

    const structureTips = Array.isArray(parsed?.structureTips)
      ? parsed.structureTips.map((tip) => String(tip || '').trim()).filter(Boolean).slice(0, 4)
      : [];
    const sampleAnswer = String(parsed?.sampleAnswer || '').trim();

    return res.json({
      structureTips,
      sampleAnswer
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
