import { SpeakingAttempt } from '../models/index.js';

/**
 * Lưu và tra lại các lần đọc to đã được chấm.
 *
 *   POST /api/speaking-attempts              lưu một lần chấm
 *   GET  /api/speaking-attempts              các lần của CHÍNH người đang đăng nhập
 *   GET  /api/speaking-attempts/progress     đường tiến bộ, theo từng bài
 *
 * ⚠️ Mọi con số đều do SERVER rút ra từ gói kết quả, không nhận từ body —
 * xem `extractAttempt`. `user_id` luôn là `req.user.id`. Học viên chỉ xem
 * được của mình; admin xem được của người khác qua `?user_id=`.
 */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Rút các cột từ nguyên gói `result` mà dịch vụ chấm trả về.
 *
 * Hai nhánh có hình dạng khác nhau, và CỐ Ý khác:
 *   tiếng Nhật: `scores` (phương án B — chỉ độ trôi chảy vào điểm)
 *   tiếng Anh : `utterance` = {accuracy, fluency, prosodic, total} thang 0-10
 *
 * `n_words`, `n_hesitations`, `hesitation_rate` lấy từ
 * `scores.criteria.fluency` — tức ĐÚNG mẫu số mà phép chấm đã dùng, không
 * phải đếm lại từ văn bản. Nếu đoạn dưới sàn thì `criteria.fluency` không
 * tồn tại, nên cộng tay lại từ từng câu để vẫn có số đo thô.
 */
export function extractAttempt(result, language) {
  const lang = String(language || result?.language || '').slice(0, 2);
  const out = { scoring_scale: null, total_score: null, total_label: null };

  const sents = Array.isArray(result?.sentences) ? result.sentences : [];

  // --- số đo thô từ từng câu: luôn tính, cả khi KHÔNG có điểm ---
  let n_words = 0; let n_hes = 0; let n_iw = 0; let measured = 0;
  for (const s of sents) {
    const fl = s?.criteria?.fluency?.detail || s?.fluency || null;
    if (!fl || !fl.intra_word_measurable) continue;
    measured += 1;
    n_words += num(fl.n_words) || 0;
    n_hes += num(fl.n_hesitation) || 0;
    n_iw += num(fl.n_intra_word_pauses) || 0;
  }
  if (measured) {
    out.n_words = n_words;
    out.n_hesitations = n_hes;
    out.intra_word_count = n_iw;
  }

  if (lang === 'ja') {
    const sc = result?.scores || null;
    out.scoring_scale = 'ja_fluency_0_100';
    if (sc) {
      out.total_score = num(sc.total);
      out.total_label = sc.total_label || null;
      out.not_scored_reason = sc.not_scored?.fluency || null;

      const f = sc.criteria?.fluency || null;
      if (f) {
        // Mẫu số của chính phép chấm thắng số cộng tay ở trên.
        out.n_words = num(f.counts?.words) ?? out.n_words ?? null;
        out.n_hesitations = num(f.counts?.hesitations) ?? out.n_hesitations ?? null;
        out.hesitation_rate = num(f.value);
        out.anchor_p90 = num(f.anchors?.native_p90);
        out.anchor_min_words = num(f.min_words);
      }
      const wc = sc.criteria?.word_correctness || null;
      if (wc) out.word_flag_rate = num(wc.value);
    }
    if (out.hesitation_rate == null && out.n_words) {
      out.hesitation_rate = Number((out.n_hesitations / out.n_words).toFixed(4));
    }
    if (!sc) {
      // Đường đọc THEO TỪNG LƯỢT: mỗi lượt là một bản ghi riêng nên dịch vụ
      // không gộp cả đoạn, không có khối `scores`. Vẫn lưu, vì số ĐẾM
      // (`intra_word_count`) có giá trị ở mọi độ dài — nhưng phải nói rõ vì
      // sao không có điểm, đừng để trống như thể lỗi.
      out.not_scored_reason = 'Đọc theo từng lượt: mỗi lượt một bản ghi nên '
        + 'không gộp được cả đoạn, không có điểm độ trôi chảy. Số chỗ ngắt '
        + 'giữa từ vẫn đếm được. Muốn có điểm thì đọc một lèo cả hội thoại.';
    }
  } else if (lang === 'en') {
    out.scoring_scale = 'en_vstep_0_10';
    const u = result?.utterance || null;
    if (u) {
      out.en_scores_json = JSON.stringify(u);
      out.total_score = num(u.total?.score);
      out.total_label = 'Điểm tổng VSTEP (0-10)';
    }
  }

  const words = result?.feedback?.practice_words || result?.practice_words || null;
  if (Array.isArray(words) && words.length) {
    out.word_flags_json = JSON.stringify(words.slice(0, 200));
  }
  return out;
}

export const createSpeakingAttempt = async (req, res) => {
  try {
    const { exercise_id: exerciseId, language_id: languageId,
      mode, result } = req.body || {};
    if (!result || typeof result !== 'object') {
      return res.status(400).json({ message: 'Thiếu `result` của lần chấm.' });
    }
    if (result.error) {
      return res.status(400).json({
        message: 'Lần chấm bị lỗi, không lưu.', detail: result.error
      });
    }
    const langId = Number(languageId)
      || (String(result.language).slice(0, 2) === 'ja' ? 2 : 1);

    const cols = extractAttempt(result, result.language
      || (langId === 2 ? 'ja' : 'en'));

    const row = await SpeakingAttempt.create({
      ...cols,
      user_id: req.user.id,                 // LUÔN từ token, không từ body
      exercise_id: Number(exerciseId) || null,
      language_id: langId,
      mode: ['single', 'turns', 'passage'].includes(mode) ? mode : 'passage',
      raw_json: JSON.stringify(result)
    });

    // Không trả `raw_json` về: trình duyệt vừa gửi nó lên.
    const { raw_json: _omit, ...lean } = row.toJSON();
    return res.status(201).json(lean);
  } catch (err) {
    console.error('createSpeakingAttempt:', err);
    return res.status(500).json({ message: 'Không lưu được lần chấm.' });
  }
};

export const listSpeakingAttempts = async (req, res) => {
  try {
    const where = { user_id: req.user.id };
    // Chỉ admin được xem của người khác.
    if (req.query.user_id && req.user.role === 'admin') {
      where.user_id = Number(req.query.user_id);
    }
    if (req.query.exercise_id) where.exercise_id = Number(req.query.exercise_id);
    if (req.query.language_id) where.language_id = Number(req.query.language_id);

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await SpeakingAttempt.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      attributes: { exclude: ['raw_json'] }
    });
    return res.json(rows);
  } catch (err) {
    console.error('listSpeakingAttempts:', err);
    return res.status(500).json({ message: 'Không đọc được danh sách.' });
  }
};

/**
 * Đường tiến bộ, gom theo bài.
 *
 * Trả HAI đường cho mỗi bài, và nói rõ đường nào dùng được khi nào:
 *   `intra_word`  — phép ĐẾM, có ở MỌI độ dài, mốc so là đúng số 0
 *   `score`       — chỉ có ở đoạn >= sàn từ; đoạn ngắn hơn trả null
 *
 * Không tự tính "cải thiện mấy phần trăm": điểm là VỊ TRÍ so với mốc người
 * bản ngữ, không phải thang tuyến tính, nên phần trăm trên nó vô nghĩa.
 */
export const getSpeakingProgress = async (req, res) => {
  try {
    const where = { user_id: req.user.id };
    if (req.query.user_id && req.user.role === 'admin') {
      where.user_id = Number(req.query.user_id);
    }
    if (req.query.language_id) where.language_id = Number(req.query.language_id);

    const rows = await SpeakingAttempt.findAll({
      where,
      order: [['created_at', 'ASC']],
      limit: 1000,
      attributes: { exclude: ['raw_json', 'word_flags_json', 'en_scores_json'] }
    });

    const byExercise = new Map();
    for (const r of rows) {
      const k = r.exercise_id ?? 'le';
      if (!byExercise.has(k)) byExercise.set(k, []);
      byExercise.get(k).push({
        id: r.id,
        // `underscored: true` đổi TÊN CỘT trong SQL, nhưng thuộc tính của
        // model vẫn là `createdAt`. Bản đầu đọc `r.created_at` nên trường
        // `at` biến mất khỏi kết quả — phép thử 21/10/2026 bắt được.
        at: r.createdAt ?? r.created_at,
        score: r.total_score == null ? null : Number(r.total_score),
        n_words: r.n_words,
        intra_word: r.intra_word_count,
        hesitation_rate: r.hesitation_rate == null
          ? null : Number(r.hesitation_rate),
        anchor_p90: r.anchor_p90 == null ? null : Number(r.anchor_p90),
        anchor_min_words: r.anchor_min_words
      });
    }

    const items = [...byExercise.entries()].map(([exercise_id, list]) => {
      const scored = list.filter((x) => x.score != null);
      const counted = list.filter((x) => x.intra_word != null);
      return {
        exercise_id: exercise_id === 'le' ? null : Number(exercise_id),
        n_attempts: list.length,
        attempts: list,
        score_first: scored.length ? scored[0].score : null,
        score_last: scored.length ? scored[scored.length - 1].score : null,
        n_scored: scored.length,
        intra_word_first: counted.length ? counted[0].intra_word : null,
        intra_word_last: counted.length
          ? counted[counted.length - 1].intra_word : null
      };
    });

    return res.json({
      items,
      notes: {
        intra_word: 'Số chỗ ngắt GIỮA một từ. Mốc so là đúng 0 — phân vị 90% '
          + 'của 173 người bản ngữ SpeechBSD là 0,0000 (bước 57). Là phép '
          + 'ĐẾM nên dùng được ở mọi độ dài, kể cả đoạn không có điểm.',
        score: 'Điểm chỉ phản ánh ĐỘ TRÔI CHẢY và chỉ có khi đoạn đạt sàn từ '
          + '(hiện là 20). Đoạn ngắn hơn trả null — đó là trạng thái bình '
          + 'thường, không phải lỗi.',
        anchor: 'Mỗi lần ghi kèm `anchor_p90` và `anchor_min_words` đã dùng. '
          + 'Mốc đổi thì điểm cũ vẫn đọc được đúng bối cảnh, và tính lại '
          + 'được từ `hesitation_rate` + `n_words`.'
      }
    });
  } catch (err) {
    console.error('getSpeakingProgress:', err);
    return res.status(500).json({ message: 'Không đọc được tiến bộ.' });
  }
};

export default {
  createSpeakingAttempt, listSpeakingAttempts, getSpeakingProgress
};
