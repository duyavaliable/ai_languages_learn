import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * MỘT LẦN ĐỌC TO ĐÃ ĐƯỢC CHẤM — lưu lại để thấy tiến bộ.
 *
 * VÌ SAO PHẢI CÓ BẢNG NÀY. Trước 21/10/2026 sản phẩm KHÔNG lưu kết quả chấm
 * phát âm ở đâu cả: `/api/pronunciation/score-passage` trả về rồi mất. Hai
 * bảng `exercise_progress` và `flashcard_progress` có trong MySQL nhưng không
 * dòng code nào trong dự án đọc hay ghi chúng (đã kiểm 21/10/2026), và
 * `exercise_progress` chỉ có một cột `score decimal(5,2)` — không chứa nổi
 * những gì phép chấm này sinh ra.
 *
 * ========================================================================
 * LUẬT 1 — LƯU SỐ ĐO THÔ, KHÔNG CHỈ LƯU ĐIỂM
 * ========================================================================
 * Điểm độ trôi chảy = ánh xạ của `hesitation_rate` qua mốc `native_p90` và
 * sàn `min_words`. Mốc hiện hành là 0,3491 với sàn 20 từ (cổng bước 60,
 * `train-Ai/reports/ja_fluency_gate_train_floor.json`) — và nó CÒN CÓ THỂ
 * ĐỔI: bước 62/63 đang mở, và mốc nào cũng phải đi qua cổng mới.
 *
 * Nếu chỉ lưu `total_score` thì mỗi lần đổi mốc là toàn bộ lịch sử cũ không
 * so được với cái mới — người học sẽ thấy điểm "tụt" vì ta đổi thước, không
 * vì họ đọc kém hơn. Lưu `hesitation_rate` + `n_words` + `anchor_p90` +
 * `anchor_min_words` thì tính lại được toàn bộ lịch sử theo mốc mới, và luôn
 * biết điểm cũ đã dùng mốc nào.
 *
 * ========================================================================
 * LUẬT 2 — `intra_word_count` LÀ CHỈ SỐ TIẾN BỘ CHÍNH, KHÔNG PHẢI ĐIỂM
 * ========================================================================
 * `total_score` chỉ có khi đoạn đạt >= 20 từ. `intra_word_count` là phép
 * ĐẾM nên miễn nhiễm chuyện lượng tử hoá mẫu số — nó có giá trị ở MỌI độ
 * dài, kể cả đoạn 6 từ không có điểm. Mốc so là đúng số 0: `intra_word_rate`
 * phân vị 90% của 173 người bản ngữ SpeechBSD = 0,0000 (bước 57).
 *
 * Nên "5 -> 3 -> 2 chỗ ngắt giữa từ" là đường tiến bộ dùng được cho mọi hội
 * thoại, còn đường điểm chỉ có ở những hội thoại đủ sàn.
 *
 * ========================================================================
 * LUẬT 3 — KHÔNG TIN SỐ DO TRÌNH DUYỆT GỬI LÊN
 * ========================================================================
 * `user_id` LUÔN lấy từ `req.user`, không bao giờ từ body. Các cột số đều
 * rút ra từ `raw_json` ở phía server bằng `extractAttempt`, nên trình duyệt
 * không tự khai điểm cho mình được.
 *
 * ========================================================================
 * HAI NGÔN NGỮ, HAI THANG — ĐỪNG CỘNG VỚI NHAU
 * ========================================================================
 * `scoring_scale` ghi rõ thang nào:
 *   'ja_fluency_0_100' — VỊ TRÍ so với mốc người bản ngữ đo được, chỉ phản
 *                        ánh ĐỘ TRÔI CHẢY (phương án B). Không phải điểm của
 *                        giáo viên.
 *   'en_vstep_0_10'    — điểm hiệu chỉnh theo nhãn người chấm SpeechOcean762.
 * Hai thang này KHÔNG so sánh được với nhau; mọi truy vấn thống kê phải lọc
 * theo `scoring_scale` hoặc `language_id`.
 *
 * KHÔNG lấp dữ liệu quá khứ: bảng bắt đầu từ rỗng (chủ dự án chốt
 * 21/10/2026). Không có lần chấm nào trước đó được lưu ở đâu để lấp.
 */
const SpeakingAttempt = sequelize.define('SpeakingAttempt', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  // LUÔN từ req.user.id. Không nhận từ body.
  user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

  // null khi người học bấm chấm một câu lẻ, không gắn vào bài nào
  exercise_id: { type: DataTypes.INTEGER, allowNull: true },
  language_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

  // 'passage' = đọc liền cả đoạn/hội thoại (có điểm nếu đủ sàn từ)
  // 'turns'   = hội thoại đọc theo từng lượt, mỗi lượt một bản ghi -> dịch
  //             vụ không gộp cả đoạn nên KHÔNG có điểm, chỉ có số đếm
  // 'single'  = một câu lẻ
  mode: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'passage' },

  // 'ja_fluency_0_100' | 'en_vstep_0_10'
  scoring_scale: { type: DataTypes.STRING(24), allowNull: true },

  // null là TRẠNG THÁI BÌNH THƯỜNG, không phải lỗi: đoạn dưới sàn 20 từ thì
  // không chấm độ trôi chảy. `not_scored_reason` nói vì sao.
  total_score: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  total_label: { type: DataTypes.STRING(64), allowNull: true },
  not_scored_reason: { type: DataTypes.TEXT, allowNull: true },

  // --- số đo thô, để tính lại được khi mốc đổi (luật 1) ---
  n_words: { type: DataTypes.INTEGER, allowNull: true },
  n_hesitations: { type: DataTypes.INTEGER, allowNull: true },
  hesitation_rate: { type: DataTypes.DECIMAL(6, 4), allowNull: true },

  // --- chỉ số tiến bộ chính (luật 2) ---
  intra_word_count: { type: DataTypes.INTEGER, allowNull: true },

  // mốc ĐÃ DÙNG cho chính dòng này — không tra lại file, vì file sẽ đổi
  anchor_p90: { type: DataTypes.DECIMAL(6, 4), allowNull: true },
  anchor_min_words: { type: DataTypes.INTEGER, allowNull: true },

  // tỉ lệ từ bị gắn cờ + danh sách từ cần luyện. ĐO ĐƯỢC, KHÔNG VÀO ĐIỂM.
  word_flag_rate: { type: DataTypes.DECIMAL(6, 4), allowNull: true },
  word_flags_json: { type: DataTypes.TEXT, allowNull: true },

  // tiếng Anh: {accuracy, fluency, prosodic, total} thang 0-10
  en_scores_json: { type: DataTypes.TEXT, allowNull: true },

  // nguyên gói dịch vụ trả về. Giữ để sau này rút thêm số đo mà không phải
  // bắt người học đọc lại.
  raw_json: { type: DataTypes.TEXT('long'), allowNull: true }
}, {
  tableName: 'speaking_attempts',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id', 'exercise_id'] },
    { fields: ['user_id', 'language_id'] }
  ]
});

export default SpeakingAttempt;
