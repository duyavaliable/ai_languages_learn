import { Exercise, Course, Lesson } from '../models/index.js';
import { parseExerciseParts, extractQuestionsFromPart, extractPassageTextFromPart } from '../services/exerciseImportService.js';

const normalizeSkillType = (skill) => {
  if (!skill) return null;
  const value = String(skill).trim().toLowerCase();
  const supported = ['listening', 'speaking', 'reading', 'writing'];
  return supported.includes(value) ? value : null;
};

const normalizeCefrLevel = (level) => {
  if (!level) return null;
  const value = String(level).trim().toUpperCase();
  const supported = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  return supported.includes(value) ? value : null;
};

export const getExercises = async (req, res) => {
  try {
    const { courseId, skill, cefrLevel, includeDeleted } = req.query;
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
        return res.status(400).json({ message: 'skill must be listening, speaking, reading or writing' });
      }
      where.skill_type = normalizedSkill;
    }

    if (cefrLevel) {
      const normalizedLevel = normalizeCefrLevel(cefrLevel);
      if (!normalizedLevel) {
        return res.status(400).json({ message: 'cefrLevel must be one of A1, A2, B1, B2, C1, C2' });
      }
      where.cefr_level = normalizedLevel;
    }

    const exercises = await Exercise.findAll({
      where,
      order: [['id', 'DESC']]
    });

    return res.json(exercises);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getExerciseById = async (req, res) => {
  try {
    const exercise = await Exercise.findOne({
      where: { id: req.params.id, is_deleted: false },
      include: [{ model: Course, as: 'course' }]
    });

    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }

    return res.json(exercise);
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
    const { course_id, exerciseTitle, skill, cefrLevel } = req.body;
    let parts = [];
    try {
      parts = req.body.parts ? (typeof req.body.parts === 'string' ? JSON.parse(req.body.parts) : req.body.parts) : [];
    } catch (_e) {
      return res.status(400).json({ message: 'Invalid parts payload' });
    }

    if (!course_id) return res.status(400).json({ message: 'course_id is required' });
    const course = await Course.findOne({ where: { id: course_id, is_deleted: false } });
    if (!course) return res.status(400).json({ message: 'course_id is invalid or deleted' });

    const normalizedSkill = normalizeSkillType(skill) || 'reading';
    const normalizedLevel = normalizeCefrLevel(cefrLevel) || 'A2';

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
      const task_prompt = normalizedSkill === 'listening' ? (introText || null) : null;
      const sample_answer = null;
      
      // Parse questions, using AI for reading answers if needed
      const questions = await extractQuestionsFromPart(fullPartText, {
        skill: normalizedSkill,
        useAiForAnswers: normalizedSkill === 'reading'
      });
      
      // Hide correctAnswer in response for UI (but still save in DB)
      const questionsForUi = questions.map(q => ({ question: q.question, options: q.options }));
      const questions_json = JSON.stringify(questions);
      const time_limit_sec = (normalizedSkill === 'writing' || normalizedSkill === 'speaking') ? 900 : 300;

      const row = await Exercise.create({
        course_id: Number(course_id),
        title: name,
        skill_type: normalizedSkill,
        cefr_level: normalizedLevel,
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
        questions: questionsForUi, // Return questions without correct answers
        questionCount: questionsForUi.length
      });
    }

    return res.json({ created });
  } catch (error) {
    console.error('[createExercisesFromParts] Error:', error);
    return res.status(500).json({ message: error.message });
  }
};
