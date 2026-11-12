import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Bài đọc cho phần chấm phát âm.
 *
 * VÌ SAO PHẢI CÓ BẢNG RIÊNG, KHÔNG DÙNG `exercises`. Model chấm phát âm cần
 * biết TRƯỚC người học phải đọc câu gì — nó so bản ghi với một văn bản đích.
 * Bảng `exercises` chứa đề VSTEP: câu hỏi trắc nghiệm, đề nói tự do, đoạn đọc
 * hiểu. Không có chỗ nào là "câu người học phải đọc to".
 *
 * Nếu lấy đại `reading_passage` của `exercises` làm văn bản đích thì hỏng: đoạn
 * đọc hiểu dài hàng trăm từ, trong khi model train trên câu dài tối đa 10 từ —
 * đưa câu dài hơn vào là dùng model ngoài miền.
 *
 * MỖI DÒNG LÀ MỘT LẦN ĐỌC. `lines_json` là mảng [{speaker, text}]. Tiếng Anh
 * thì `speaker` để trống (đoạn văn liền mạch); tiếng Nhật thì `speaker` là tên
 * vai trong hội thoại. Người học đọc từng dòng, mỗi dòng chấm riêng.
 *
 * `has_prosody_ref` — CHỖ DỄ SAI NHẤT. Tiêu chí NGỮ ĐIỆU CẢ CÂU của tiếng Nhật
 * cần mốc của >= 6 người bản ngữ đọc CHÍNH câu đó. Chỉ 42 câu của KANI có mốc.
 * Cờ này đánh dấu bài nào chấm được cả bốn tiêu chí, bài nào chỉ ba. ĐỪNG tự
 * bật cờ bằng tay: nó phải khớp với `GET /ja/sentences` của dịch vụ chấm, và
 * script seed kiểm điều đó. Bật sai thì giao diện hứa một tiêu chí mà model
 * không trả về.
 *
 * `source` / `license` BẮT BUỘC có. Đồ án phải trích dẫn được mọi nguồn liệu,
 * và không được nạp nội dung có bản quyền (sách giáo trình) vào đây.
 */
const SpeakingPassage = sequelize.define('SpeakingPassage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  language_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

  // 'passage' = đoạn văn liền mạch (tiếng Anh)
  // 'dialogue' = hội thoại nhiều vai (tiếng Nhật)
  kind: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'passage' },

  title: { type: DataTypes.STRING(225), allowNull: false },
  topic: { type: DataTypes.STRING(225), allowNull: true },
  level: { type: DataTypes.STRING(16), allowNull: true },

  // [{ "speaker": "A", "text": "..." }, ...] — mỗi phần tử là MỘT lần đọc
  lines_json: { type: DataTypes.TEXT('long'), allowNull: false },

  source: { type: DataTypes.STRING(500), allowNull: true },
  license: { type: DataTypes.STRING(200), allowNull: true },
  attribution: { type: DataTypes.TEXT, allowNull: true },

  // true = MỌI dòng đều có mốc người bản ngữ -> chấm được cả bốn tiêu chí
  has_prosody_ref: {
    type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false
  },

  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
  is_deleted: {
    type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false
  }
}, {
  tableName: 'speaking_passages',
  timestamps: true,
  underscored: true
});

export default SpeakingPassage;
