import User from './User.js';
import Language from './Language.js';
import Exercise from './Exercise.js';
import Vocabulary from './Vocabulary.js';
import SpeakingPassage from './SpeakingPassage.js';
import SpeakingAttempt from './SpeakingAttempt.js';

/**
 * Khái niệm "bài học" (Lesson) ĐÃ BỎ — 12/10/2026.
 *
 * Lý do, đo được chứ không phỏng đoán:
 *   - bảng `lessons` có 0 dòng sau cả quá trình phát triển;
 *   - bảng `exercises` KHÔNG có cột `lesson_id`;
 *   - bảng `vocabulary` cũng KHÔNG có `lesson_id`, dù model cũ khai là bắt
 *     buộc — khiến mọi truy vấn từ vựng chết với ER_BAD_FIELD_ERROR;
 *   - tab Lessons trong trang quản trị đã tự tắt từ trước.
 *
 * Bỏ cùng lúc hai model gắn chặt vào nó:
 *   - `Grammar` — có `lesson_id` bắt buộc, bảng `grammar` không tồn tại
 *   - `UserProgress` — có `lesson_id` bắt buộc, bảng `user_progress` không tồn tại
 *
 * ⚠️ Kỹ năng NGỮ PHÁP KHÔNG bị ảnh hưởng: nó đi qua `exercises.skill_type =
 * 'grammar'`, không liên quan gì tới model `Grammar` vừa bỏ.
 *
 * Mọi thứ giờ gắn vào NGÔN NGỮ — một tầng, và khớp với dữ liệu thật.
 */

// Exercise - Language
Exercise.belongsTo(Language, { foreignKey: 'language_id', as: 'language' });
Language.hasMany(Exercise, { foreignKey: 'language_id', as: 'exercises' });

// Exercise keeps course_id as a legacy grouping key.

// Vocabulary - Language
Vocabulary.belongsTo(Language, { foreignKey: 'language_id', as: 'language' });
Language.hasMany(Vocabulary, { foreignKey: 'language_id', as: 'vocabularyItems' });

// SpeakingPassage - Language. Bài đọc cho phần chấm phát âm; bảng riêng vì
// `exercises` không có chỗ nào là "câu người học phải đọc to".
SpeakingPassage.belongsTo(Language, { foreignKey: 'language_id', as: 'language' });
Language.hasMany(SpeakingPassage, { foreignKey: 'language_id', as: 'speakingPassages' });

// SpeakingAttempt — MỘT LẦN ĐỌC TO ĐÃ CHẤM. Bảng mới 21/10/2026: trước đó sản
// phẩm không lưu kết quả chấm phát âm ở đâu cả. Gắn vào NGƯỜI và NGÔN NGỮ,
// không gắn vào `speaking_passages`, vì tư liệu đọc giờ nằm trong `exercises`
// (xem scripts/migrateSpeakingToExercises.mjs).
SpeakingAttempt.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(SpeakingAttempt, { foreignKey: 'user_id', as: 'speakingAttempts' });
SpeakingAttempt.belongsTo(Language, { foreignKey: 'language_id', as: 'language' });
SpeakingAttempt.belongsTo(Exercise, { foreignKey: 'exercise_id', as: 'exercise' });

export { User, Language, Exercise, Vocabulary, SpeakingPassage, SpeakingAttempt };
