import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

/**
 * Từ vựng — gắn vào NGÔN NGỮ, không gắn vào bài học.
 *
 * Trước đây model khai `lesson_id` (allowNull: false), nhưng bảng `vocabulary`
 * trong MySQL KHÔNG có cột đó. Sequelize đưa mọi thuộc tính của model vào câu
 * SELECT, nên mọi truy vấn đều chết với `Unknown column 'Vocabulary.lesson_id'`
 * — kể cả khi KHÔNG join. Toàn bộ tính năng từ vựng hỏng vì đúng một dòng khai
 * sai: GET danh sách, GET chi tiết, POST tạo mới đều trả 500 hoặc 400.
 *
 * Bỏ `lesson_id` là làm model khớp với dữ liệu THẬT: 60 từ hiện có đều mang
 * `language_id`, không dòng nào có khái niệm bài học, và bảng `lessons` rỗng
 * sau cả quá trình phát triển. Giao diện quản trị cũng đã tự tắt tab Lessons
 * từ trước — khái niệm "bài học" đã bị bỏ, chỉ là mã chưa dọn.
 *
 * `language_id` và `part_of_speech` là cột CÓ THẬT trong bảng mà model cũ
 * không khai, nên không đọc ra được. Bổ sung luôn.
 */
const Vocabulary = sequelize.define('Vocabulary', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  language_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  word: { type: DataTypes.STRING(225), allowNull: false },
  pronunciation: { type: DataTypes.STRING(225), allowNull: true },
  meaning: { type: DataTypes.TEXT, allowNull: false },
  example_sentence: { type: DataTypes.TEXT, allowNull: true },
  example_translation: { type: DataTypes.TEXT, allowNull: true },
  part_of_speech: { type: DataTypes.STRING(50), allowNull: true },
  audio_url: { type: DataTypes.STRING(225), allowNull: true },
  // Xoa mem, giong `exercises` va `speaking_passages`.
  is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
  tableName: 'vocabulary',
  timestamps: false
});

export default Vocabulary;