import { SpeakingPassage, Language } from '../models/index.js';

/**
 * CRUD bài đọc cho phần chấm phát âm.
 *
 * Người học: GET /  và GET /:id
 * Admin: POST, PUT, DELETE
 *
 * ⚠️ `has_prosody_ref` KHÔNG nhận từ client. Nó phải khớp với danh sách câu mà
 * dịch vụ chấm thật sự có mốc người bản ngữ; để client tự khai thì giao diện sẽ
 * hứa tiêu chí Ngữ điệu mà model không trả về. Server tự xác minh bằng cách hỏi
 * `GET /ja/sentences` của dịch vụ chấm.
 */

const SERVICE = (process.env.PRONUNCIATION_SERVICE_URL
  || 'http://127.0.0.1:8000').replace(/\/+$/, '');

function parseLines(raw) {
  // Nhận cả ba dạng cho dễ dùng ở trang admin:
  //   mảng chuỗi            ["câu 1", "câu 2"]
  //   mảng object           [{speaker, text}, ...]
  //   một chuỗi nhiều dòng  "A: xin chào\nB: chào bạn"
  if (Array.isArray(raw)) {
    return raw
      .map((x) => (typeof x === 'string'
        ? { speaker: null, text: x.trim() }
        : { speaker: x?.speaker ?? null, text: String(x?.text || '').trim() }))
      .filter((x) => x.text);
  }
  return String(raw || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^([^:：]{1,20})[:：]\s*(.+)$/);
      return m ? { speaker: m[1].trim(), text: m[2].trim() }
        : { speaker: null, text: l };
    });
}

/** Hỏi dịch vụ chấm xem những câu nào thật sự có mốc người bản ngữ. */
async function verifyProsody(lines) {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const r = await fetch(`${SERVICE}/ja/sentences`, { signal: ac.signal });
    clearTimeout(timer);
    if (!r.ok) return { ok: false, has: false, reason: `HTTP ${r.status}` };
    const d = await r.json();
    const set = new Set(d.sentences || []);
    return { ok: true, has: lines.length > 0 && lines.every((l) => set.has(l.text)) };
  } catch (e) {
    return { ok: false, has: false, reason: e.message };
  }
}

export const listSpeakingPassages = async (req, res, next) => {
  try {
    const where = { is_deleted: false };
    if (req.query.language_id) where.language_id = Number(req.query.language_id);
    const rows = await SpeakingPassage.findAll({
      where,
      include: [{ model: Language, as: 'language', attributes: ['id', 'name', 'code'] }],
      order: [['language_id', 'ASC'], ['sort_order', 'ASC'], ['id', 'ASC']]
    });
    res.json(rows.map((r) => {
      const o = r.toJSON();
      o.lines = JSON.parse(o.lines_json || '[]');
      o.n_lines = o.lines.length;
      delete o.lines_json;
      return o;
    }));
  } catch (err) { next(err); }
};

export const getSpeakingPassageById = async (req, res, next) => {
  try {
    const r = await SpeakingPassage.findByPk(req.params.id, {
      include: [{ model: Language, as: 'language', attributes: ['id', 'name', 'code'] }]
    });
    if (!r || r.is_deleted) {
      return res.status(404).json({ message: 'Không tìm thấy bài đọc' });
    }
    const o = r.toJSON();
    o.lines = JSON.parse(o.lines_json || '[]');
    delete o.lines_json;
    res.json(o);
  } catch (err) { next(err); }
};

export const createSpeakingPassage = async (req, res, next) => {
  try {
    const lines = parseLines(req.body?.lines ?? req.body?.content);
    if (!lines.length) {
      return res.status(400).json({
        message: 'Cần ít nhất một dòng. Mỗi dòng là MỘT lần đọc; với hội '
          + 'thoại thì viết "Vai: nội dung".'
      });
    }
    const languageId = Number(req.body?.language_id);
    if (!languageId) {
      return res.status(400).json({ message: 'Thiếu language_id' });
    }

    // Chỉ tiếng Nhật mới có cơ chế mốc bản ngữ (language_id = 2).
    let hasRef = false;
    let refNote = null;
    if (languageId === 2) {
      const v = await verifyProsody(lines);
      hasRef = v.has;
      refNote = v.ok
        ? (v.has
          ? 'Mọi dòng đều có mốc người bản ngữ — chấm được cả bốn tiêu chí.'
          : 'Có dòng chưa có mốc người bản ngữ — bài này chấm ba tiêu chí, '
            + 'ô Ngữ điệu sẽ hiện "Không đánh giá".')
        : `Không hỏi được dịch vụ chấm (${v.reason}); để cờ false cho an toàn.`;
    }

    const row = await SpeakingPassage.create({
      language_id: languageId,
      kind: String(req.body?.kind || 'passage'),
      title: String(req.body?.title || '').trim() || 'Bài đọc',
      topic: req.body?.topic || null,
      level: req.body?.level || null,
      lines_json: JSON.stringify(lines),
      source: req.body?.source || null,
      license: req.body?.license || null,
      attribution: req.body?.attribution || null,
      has_prosody_ref: hasRef,          // server quyết định, KHÔNG lấy từ client
      sort_order: Number(req.body?.sort_order || 0),
      created_by: req.user?.id || null
    });

    res.status(201).json({
      ...row.toJSON(),
      lines,
      prosody_note: refNote
    });
  } catch (err) { next(err); }
};

export const updateSpeakingPassage = async (req, res, next) => {
  try {
    const row = await SpeakingPassage.findByPk(req.params.id);
    if (!row || row.is_deleted) {
      return res.status(404).json({ message: 'Không tìm thấy bài đọc' });
    }
    const patch = {};
    for (const k of ['title', 'topic', 'level', 'kind', 'source', 'license',
      'attribution']) {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    }
    if (req.body?.sort_order !== undefined) {
      patch.sort_order = Number(req.body.sort_order);
    }
    let refNote = null;
    if (req.body?.lines !== undefined || req.body?.content !== undefined) {
      const lines = parseLines(req.body.lines ?? req.body.content);
      if (!lines.length) {
        return res.status(400).json({ message: 'Cần ít nhất một dòng' });
      }
      patch.lines_json = JSON.stringify(lines);
      if (row.language_id === 2) {
        const v = await verifyProsody(lines);
        patch.has_prosody_ref = v.has;
        refNote = v.ok ? null : `Không hỏi được dịch vụ chấm (${v.reason})`;
      }
    }
    await row.update(patch);
    res.json({ ...row.toJSON(), prosody_note: refNote });
  } catch (err) { next(err); }
};

export const deleteSpeakingPassage = async (req, res, next) => {
  try {
    const row = await SpeakingPassage.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Không tìm thấy bài đọc' });
    await row.update({ is_deleted: true });   // xoá mềm, giữ lịch sử
    res.json({ message: 'Đã xoá', id: row.id });
  } catch (err) { next(err); }
};
