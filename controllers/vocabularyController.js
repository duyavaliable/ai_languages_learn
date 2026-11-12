import { Language, Vocabulary } from '../models/index.js';
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
		// `lessonId` giu lai de link cu khong vo, nhung bo qua: tu vung gan vao
		// NGON NGU, khong gan vao bai hoc. Xem ghi chu o models/Vocabulary.js.
		const { languageId } = req.query;
		const where = { is_deleted: false };

		if (languageId) {
			where.language_id = Number(languageId);
		}

		const rows = await Vocabulary.findAll({
			where,
			include: [{ model: Language, as: 'language', attributes: ['id', 'name', 'code'], required: false }],
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
			include: [{ model: Language, as: 'language', attributes: ['id', 'name', 'code'], required: false }]
		});

		if (row && row.is_deleted) {
			return res.status(404).json({ message: 'Vocabulary not found' });
		}

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
		// Cot `language_id` trong MySQL la NOT NULL, nen bat buoc. Kiem o day de
		// tra 400 kem loi ro rang, thay vi de MySQL nem 500 kho hieu.
		const languageId = Number(req.body.language_id);
		if (!languageId) {
			return res.status(400).json({ message: 'language_id la bat buoc' });
		}
		const lang = await Language.findByPk(languageId);
		if (!lang) {
			return res.status(400).json({ message: 'language_id khong ton tai' });
		}

		const payload = normalizeVocabularyPayload(req.body);
		if (!payload.word || !payload.meaning) {
			return res.status(400).json({ message: 'word and meaning are required' });
		}

		// Rang buoc duy nhat `(language_id, word)` tinh ca tu DA XOA MEM. Neu
		// khong xu ly, them lai mot tu vua xoa se bao "Validation error" ma
		// nguoi dung khong hieu vi nhin vao danh sach thi tu do da bien mat.
		// Gap ca do thi khoi phuc ban ghi cu va cap nhat noi dung moi.
		const buried = await Vocabulary.findOne({
			where: { language_id: languageId, word: payload.word, is_deleted: true }
		});
		if (buried) {
			await buried.update({ ...payload, is_deleted: false });
			return res.status(200).json({
				...buried.toJSON(),
				restored_from_deleted: true,
				message: 'Tu nay da bi xoa mem truoc do; he thong khoi phuc va cap nhat lai.'
			});
		}

		const created = await Vocabulary.create({
			language_id: languageId,
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

		if (Object.prototype.hasOwnProperty.call(req.body, 'language_id')) {
			const lang = await Language.findByPk(Number(req.body.language_id));
			if (!lang) {
				return res.status(400).json({ message: 'language_id khong ton tai' });
			}
			row.language_id = Number(req.body.language_id);
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
		const languageId = Number(req.body.language_id);
		if (!languageId) {
			return res.status(400).json({ message: 'language_id la bat buoc' });
		}
		const lang = await Language.findByPk(languageId);
		if (!lang) {
			return res.status(400).json({ message: 'language_id khong ton tai' });
		}

		if (!Array.isArray(req.body.items)) {
			return res.status(400).json({ message: 'items must be an array' });
		}

		const normalizedItems = req.body.items
			.map((item) => normalizeVocabularyPayload(item))
			.filter((item) => item.word && item.meaning)
			.map((item) => ({
				language_id: languageId,
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

/**
 * Xoa MEM mot tu vung: dat `is_deleted = true`, ban ghi van con trong CSDL.
 *
 * Theo dung quy uoc cua `exercises` va `lessons`: DELETE la xoa mem, muon xoa
 * han phai goi them `/:id/permanent`. Hai buoc de bam nham mot lan khong mat
 * du lieu.
 *
 * ⚠️ Rang buoc duy nhat `(language_id, word)` van tinh ca tu da xoa mem. Nen
 * xoa mem "neko" roi them lai "neko" cung ngon ngu se bi tu choi. Handler tao
 * moi tu nhan ra va khoi phuc ban ghi cu thay vi bao loi kho hieu.
 */
export const deleteVocabulary = async (req, res) => {
	try {
		const row = await Vocabulary.findOne({
			where: { id: req.params.id, is_deleted: false }
		});
		if (!row) {
			return res.status(404).json({ message: 'Vocabulary not found' });
		}

		await row.update({ is_deleted: true });

		return res.json({
			message: 'Vocabulary deleted',
			deleted: { id: row.id, word: row.word, language_id: row.language_id },
			hint: 'Khoi phuc: PATCH /api/vocabulary/' + row.id + '/restore'
		});
	} catch (error) {
		return res.status(500).json({ message: error.message });
	}
};

/** Danh sach tu da xoa mem, de admin xem va khoi phuc. */
export const getDeletedVocabulary = async (req, res) => {
	try {
		const where = { is_deleted: true };
		if (req.query.languageId) {
			where.language_id = Number(req.query.languageId);
		}

		const rows = await Vocabulary.findAll({
			where,
			include: [{ model: Language, as: 'language', attributes: ['id', 'name', 'code'], required: false }],
			order: [['id', 'DESC']]
		});

		return res.json(rows);
	} catch (error) {
		return res.status(500).json({ message: error.message });
	}
};

/** Khoi phuc mot tu da xoa mem. */
export const restoreVocabulary = async (req, res) => {
	try {
		const row = await Vocabulary.findOne({
			where: { id: req.params.id, is_deleted: true }
		});
		if (!row) {
			return res.status(404).json({ message: 'Khong tim thay tu da xoa' });
		}

		await row.update({ is_deleted: false });

		return res.json({ message: 'Vocabulary restored', restored: { id: row.id, word: row.word } });
	} catch (error) {
		return res.status(500).json({ message: error.message });
	}
};

/**
 * Xoa CUNG: bo han khoi CSDL, khong khoi phuc duoc.
 *
 * Chi cho phep voi tu DA xoa mem. Buoc nay co y lam kho: muon xoa han thi phai
 * xoa mem truoc da, nen khong the mat du lieu chi bang mot lan bam nham.
 */
export const purgeVocabulary = async (req, res) => {
	try {
		const row = await Vocabulary.findByPk(req.params.id);
		if (!row) {
			return res.status(404).json({ message: 'Vocabulary not found' });
		}
		if (!row.is_deleted) {
			return res.status(400).json({
				message: 'Phai xoa mem truoc (DELETE /api/vocabulary/' + row.id + ') roi moi xoa han duoc.'
			});
		}

		const removed = { id: row.id, word: row.word, language_id: row.language_id };
		await row.destroy();

		return res.json({ message: 'Vocabulary purged permanently', purged: removed });
	} catch (error) {
		return res.status(500).json({ message: error.message });
	}
};
