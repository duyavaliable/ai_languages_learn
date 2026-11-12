import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { protect } from '../middleware/auth.js';
// TẠM COMMENT (12/10/2026) — chuyển sang model của đồ án.
// Hàm vẫn còn nguyên trong services/aiService.js, KHÔNG xoá. Muốn quay lại
// Gemini thì bỏ comment dòng dưới và khối "ĐƯỜNG GEMINI" trong handler.
// import { gradeSpeechWithAI } from '../services/aiService.js';
import { scorePronunciation } from '../services/pronunciationService.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/audio/' });

/**
 * ⚠️ HAI ĐƯỜNG CHẤM NÀY KHÔNG TƯƠNG ĐƯƠNG — đọc trước khi sửa tiếp.
 *
 * Gemini (đường cũ, đang comment) nghe âm thanh rồi chấm câu nói TỰ DO theo
 * thang VSTEP: phát âm, trôi chảy, NGỮ PHÁP, TỪ VỰNG, HOÀN THÀNH YÊU CẦU, kèm
 * nhận xét bằng lời.
 *
 * Model của đồ án (đường mới) chấm việc ĐỌC THEO MỘT VĂN BẢN CHO TRƯỚC. Nó
 * cần biết người học lẽ ra phải nói gì. Vì vậy:
 *     LÀM ĐƯỢC   phát âm từng từ, độ trôi chảy, trọng âm, ngữ điệu
 *     KHÔNG LÀM  ngữ pháp, từ vựng, hoàn thành yêu cầu, nhận xét bằng lời
 *                -> ba điểm đó trả về null, KHÔNG trả 0
 *
 * Vì sao null chứ không phải 0: 0 nghĩa là "làm rất tệ", null nghĩa là "không
 * đo". Trả 0 là nói sai về người học.
 *
 * VỀ VĂN BẢN MẪU — chỗ quan trọng cho báo cáo. Model cần văn bản đích. Thứ tự:
 *   1. `target_text` — văn bản đúng của bài tập. ĐÚNG NHẤT; frontend nên gửi.
 *   2. `frontend_transcript` — thứ trình duyệt nghe được (Web Speech API).
 *      Dùng tạm được, nhưng có hai hệ quả:
 *        - trình duyệt nghe sai thì văn bản mẫu sai, nên điểm sai theo;
 *        - nó làm hệ thống PHỤ THUỘC ASR trở lại, mà "không dùng ASR" là một
 *          đóng góp của đồ án. Chỉ được tính là không dùng ASR nếu dùng (1).
 *   Phản hồi có `target_text_source` nói rõ đã đi đường nào.
 */
router.post('/assess', protect, upload.single('audio'), async (req, res) => {
  const audioPath = req.file?.path;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const frontendTranscript = String(req.body?.frontend_transcript || '').trim();
    const speakingPrompt = String(req.body?.speaking_prompt || '').trim();
    const explicitTarget = String(req.body?.target_text || '').trim();
    const language = String(req.body?.language || 'en')
      .trim().toLowerCase().slice(0, 2);

    console.log('[speech/assess] Received audio file', {
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      frontendTranscriptLength: frontendTranscript.length,
      speakingPromptLength: speakingPrompt.length,
      hasExplicitTarget: !!explicitTarget,
      language
    });

    /* ===================================================================
     * ĐƯỜNG GEMINI — TẠM COMMENT (12/10/2026), KHÔNG XOÁ
     * -------------------------------------------------------------------
     * Bỏ comment khối này (và dòng import ở đầu file) để quay lại Gemini.
     * Giữ lại vì nó là đường DUY NHẤT chấm được ngữ pháp / từ vựng / hoàn
     * thành yêu cầu cho câu nói tự do.
     *
     * const gradeResult = await gradeSpeechWithAI({
     *   audioPath,
     *   audioMimeType: req.file.mimetype,
     *   speakingPrompt,
     *   standardTranscript: frontendTranscript,
     *   frontendTranscript
     * });
     *
     * console.log('[speech/assess] AI grading completed', {
     *   pronunciationScore: gradeResult.pronunciation_score,
     *   fluencyScore: gradeResult.fluency_score,
     *   feedbackLength: gradeResult.feedback?.length || 0
     * });
     *
     * return res.json({
     *   transcript: gradeResult.transcript || '',
     *   standard_transcript: frontendTranscript,
     *   speaking_prompt: speakingPrompt,
     *   pronunciation_score: gradeResult.pronunciation_score,
     *   fluency_score: gradeResult.fluency_score,
     *   grammar_score: gradeResult.grammar_score,
     *   vocabulary_score: gradeResult.vocabulary_score,
     *   task_fulfillment_score: gradeResult.task_fulfillment_score,
     *   feedback: gradeResult.feedback,
     *   errors: gradeResult.errors || []
     * });
     * =================================================================== */

    // ---------------- ĐƯỜNG MODEL CỦA ĐỒ ÁN (đang dùng) ----------------

    const targetText = explicitTarget || frontendTranscript;
    const targetSource = explicitTarget ? 'target_text' : 'frontend_transcript';

    if (!targetText) {
      return res.status(400).json({
        error: 'no_target_text',
        message: 'Model chấm phát âm cần biết văn bản người học phải đọc. '
          + 'Gửi kèm `target_text`, hoặc `frontend_transcript` nếu không có.'
      });
    }

    const r = await scorePronunciation({
      audioPath,
      text: targetText,
      language,
      mimeType: req.file.mimetype
    });

    const c = r.criteria || {};

    // Tiếng Anh có 4 điểm cấp câu 0-10 (học từ nhãn người chấm
    // SpeechOcean762). Tiếng Nhật KHÔNG có, vì không tồn tại nhãn người chấm
    // cho tiếng Nhật — ở tiếng Nhật hai ô này là null và `criteria` mới là
    // chỗ có số.
    const u = r.utterance || {};
    const pronunciationScore = r.has_utterance_scores
      ? (u.accuracy?.score ?? null)
      : null;
    const fluencyScore = r.has_utterance_scores
      ? (u.fluency?.score ?? null)
      : null;

    console.log('[speech/assess] Model grading completed', {
      language,
      targetSource,
      hasUtteranceScores: r.has_utterance_scores,
      latency: r.latency_sec
    });

    // BỐN TIÊU CHÍ — đây là nội dung chính của phản hồi.
    //
    // Chúng thay cho ba mục ngữ pháp / từ vựng / hoàn thành yêu cầu của thang
    // VSTEP. Không phải vì ba mục kia kém, mà vì chúng trả lời câu hỏi KHÁC:
    // ba mục kia chấm NỘI DUNG bài nói, bốn tiêu chí này chấm CÁCH PHÁT ÂM.
    // Đổi đường chấm thì phải đổi cả tiêu chí, không thì là trình bày số của
    // phép đo này dưới nhãn của phép đo kia.
    //
    // Bốn khoá giống nhau ở CẢ HAI ngôn ngữ, nhưng ĐƠN VỊ khác nhau — xem
    // `unit` của từng mục. Tiếng Anh cho điểm 0-10 (học từ nhãn người chấm
    // SpeechOcean762); tiếng Nhật cho tỉ lệ và mức so với người bản ngữ (vì
    // không tồn tại nhãn người chấm cho tiếng Nhật). ĐỪNG quy về một thang.
    const criteria = {
      word_correctness: {
        label: 'Phát âm từng từ',
        ...(c.word_correctness || { available: false })
      },
      fluency: {
        label: 'Độ trôi chảy',
        ...(c.fluency || { available: false })
      },
      stress: {
        label: 'Trọng âm',
        ...(c.stress || { available: false })
      },
      intonation: {
        label: 'Ngữ điệu',
        ...(c.intonation || { available: false })
      }
    };

    return res.json({
      // --- giữ tên field cũ để frontend không vỡ ngay ---
      transcript: '',
      standard_transcript: targetText,
      speaking_prompt: speakingPrompt,
      pronunciation_score: pronunciationScore,
      fluency_score: fluencyScore,
      errors: [],

      /* -----------------------------------------------------------------
       * BA MỤC VSTEP — TẠM COMMENT (12/10/2026), KHÔNG XOÁ
       * -----------------------------------------------------------------
       * Thay bằng `criteria` phía dưới. Ba mục này cần HIỂU NỘI DUNG bài
       * nói nên chỉ đường Gemini làm được; model của đồ án chấm phát âm so
       * với văn bản cho trước. Bỏ comment cùng lúc với khối ĐƯỜNG GEMINI ở
       * trên nếu muốn quay lại.
       *
       * grammar_score: null,
       * vocabulary_score: null,
       * task_fulfillment_score: null,
       * feedback: null,
       * ----------------------------------------------------------------- */

      // --- bốn tiêu chí: chỗ có số thật ---
      scored_by: 'model của đồ án (không dùng Gemini)',
      language: r.language,
      target_text_source: targetSource,
      has_utterance_scores: r.has_utterance_scores,
      criteria,
      utterance: u,
      words: r.words || [],
      replaced_vstep_fields: ['grammar_score', 'vocabulary_score',
        'task_fulfillment_score', 'feedback'],
      replaced_reason: 'Ba mục VSTEP chấm NỘI DUNG bài nói; bốn tiêu chí này '
        + 'chấm CÁCH PHÁT ÂM. Khác câu hỏi, nên thay chứ không gán số của '
        + 'cái này vào nhãn của cái kia.',
      duration_sec: r.duration_sec,
      latency_sec: r.latency_sec
    });
  } catch (err) {
    console.error('[speech/assess] Error during assessment', {
      message: err.message,
      statusCode: err.statusCode,
      stack: err.stack
    });
    res.status(err.statusCode || 500).json({
      error: 'speech_assessment_failed',
      message: err.message || 'Failed to assess speech'
    });
  } finally {
    // Dọn file tạm dù thành công hay lỗi.
    if (audioPath) {
      fs.promises.unlink(audioPath).catch((e) =>
        console.warn('[speech/assess] Failed to cleanup audio file', {
          error: e.message
        })
      );
    }
  }
});

export default router;
