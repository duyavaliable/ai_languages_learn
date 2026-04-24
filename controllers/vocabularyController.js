import { Lesson, Vocabulary } from '../models/index.js';
import { parseVocabularyUpload } from '../services/vocabularyImportService.js';
import { validateVocabularyColumnsWithAI } from '../services/aiService.js';

const normalizeVocabularyPayload = (payload = {}) => ({
	word: String(payload.word || '').trim(),
	pronunciation: String(payload.pronunciation || '').trim(),
	meaning: String(payload.meaning || '').trim(),
	example_sentence: String(payload.example_sentence || '').trim(),
	example_translation: String(payload.example_translation || '').trim()
});

const parseBoolean = (value) => {
	if (typeof value === 'boolean') return value;
	const text = String(value || '').trim().toLowerCase();
	return text === '1' || text === 'true' || text === 'yes';
};

export const getVocabulary = async (req, res) => {
	try {
		const { lessonId } = req.query;
		const where = {};

		if (lessonId) {
			where.lesson_id = Number(lessonId);
		}

		const rows = await Vocabulary.findAll({
			where,
			include: [{ model: Lesson, as: 'lesson' }],
			order: [['id', 'DESC']]
		});

		return res.json(rows);
	} catch (error) {
		return res.status(500).json({ message: error.message });
	}
};

export const getVocabularyById = async (req, res) => {
	try {
		const row = await Vocabulary.findByPk(req.params.id, {
			include: [{ model: Lesson, as: 'lesson' }]
		});

		if (!row) {
			return res.status(404).json({ message: 'Vocabulary not found' });
		}

		return res.json(row);
	} catch (error) {
		return res.status(500).json({ message: error.message });
	}
};

export const createVocabulary = async (req, res) => {
	try {
		const lessonId = Number(req.body.lesson_id);
		if (!lessonId) {
			return res.status(400).json({ message: 'lesson_id is required' });
		}

		const lesson = await Lesson.findOne({ where: { id: lessonId, is_deleted: false } });
		if (!lesson) {
			return res.status(400).json({ message: 'lesson_id is invalid or deleted' });
		}

		const payload = normalizeVocabularyPayload(req.body);
		if (!payload.word || !payload.meaning) {
			return res.status(400).json({ message: 'word and meaning are required' });
		}

		const created = await Vocabulary.create({
			lesson_id: lessonId,
			...payload
		});

		return res.status(201).json(created);
	} catch (error) {
		return res.status(500).json({ message: error.message });
	}
};

export const updateVocabulary = async (req, res) => {
	try {
		const row = await Vocabulary.findByPk(req.params.id);
		if (!row) {
			return res.status(404).json({ message: 'Vocabulary not found' });
		}

		if (Object.prototype.hasOwnProperty.call(req.body, 'lesson_id')) {
			const lesson = await Lesson.findOne({ where: { id: Number(req.body.lesson_id), is_deleted: false } });
			if (!lesson) {
				return res.status(400).json({ message: 'lesson_id is invalid or deleted' });
			}
			row.lesson_id = Number(req.body.lesson_id);
		}

		const normalized = normalizeVocabularyPayload(req.body);
		if (Object.prototype.hasOwnProperty.call(req.body, 'word')) {
			row.word = normalized.word;
		}
		if (Object.prototype.hasOwnProperty.call(req.body, 'pronunciation')) {
			row.pronunciation = normalized.pronunciation;
		}
		if (Object.prototype.hasOwnProperty.call(req.body, 'meaning')) {
			row.meaning = normalized.meaning;
		}
		if (Object.prototype.hasOwnProperty.call(req.body, 'example_sentence')) {
			row.example_sentence = normalized.example_sentence;
		}
		if (Object.prototype.hasOwnProperty.call(req.body, 'example_translation')) {
			row.example_translation = normalized.example_translation;
		}

		if (!row.word || !row.meaning) {
			return res.status(400).json({ message: 'word and meaning are required' });
		}

		await row.save();
		return res.json(row);
	} catch (error) {
		return res.status(500).json({ message: error.message });
	}
};

export const previewVocabularyUpload = async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ message: 'File is required' });
		}

		const enableAiValidation = parseBoolean(req.body?.validateWithAI);

		const parsed = await parseVocabularyUpload(req.file);
		let validatedItems = parsed.items;
		let aiWarnings = [];
		let aiValidationApplied = false;

		if (enableAiValidation && parsed.items.length > 0) {
			try {
				const aiResult = await validateVocabularyColumnsWithAI(parsed.items);
				validatedItems = Array.isArray(aiResult?.items) ? aiResult.items : parsed.items;
				aiWarnings = Array.isArray(aiResult?.warnings) ? aiResult.warnings : [];
				aiValidationApplied = true;
			} catch (aiError) {
				aiWarnings.push(`AI validation skipped: ${aiError.message}`);
			}
		}

		return res.json({
			fileType: parsed.fileType,
			source: parsed.source,
			usedTable: parsed.usedTable,
			totalRows: parsed.totalTableRows,
			totalWords: validatedItems.length,
			totalItems: validatedItems.length,
			aiValidationApplied,
			aiWarnings,
			items: validatedItems,
			rawText: parsed.rawText
		});
	} catch (error) {
		return res.status(400).json({ message: error.message });
	}
};

export const importVocabularyBatch = async (req, res) => {
	try {
		const lessonId = Number(req.body.lesson_id);
		if (!lessonId) {
			return res.status(400).json({ message: 'lesson_id is required' });
		}

		const lesson = await Lesson.findOne({ where: { id: lessonId, is_deleted: false } });
		if (!lesson) {
			return res.status(400).json({ message: 'lesson_id is invalid or deleted' });
		}

		if (!Array.isArray(req.body.items)) {
			return res.status(400).json({ message: 'items must be an array' });
		}

		const normalizedItems = req.body.items
			.map((item) => normalizeVocabularyPayload(item))
			.filter((item) => item.word && item.meaning)
			.map((item) => ({
				lesson_id: lessonId,
				...item
			}));

		if (normalizedItems.length === 0) {
			return res.status(400).json({ message: 'No valid vocabulary rows to import' });
		}

		const inserted = await Vocabulary.bulkCreate(normalizedItems);

		return res.status(201).json({
			message: 'Vocabulary imported successfully',
			inserted: inserted.length
		});
	} catch (error) {
		return res.status(500).json({ message: error.message });
	}
};
