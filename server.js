import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

import sequelize from './config/database.js'; // Import sequelize instance
import { ensureDatabaseSchema } from './config/ensureSchema.js';
import errorHandler from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import courseRoutes from './routes/courses.js';
import vocabularyRoutes from './routes/vocabulary.js';
import userRoutes from './routes/users.js';
import languageRoutes from './routes/languages.js';
import aiRoutes from './routes/ai.js';
import exerciseRoutes from './routes/exercises.js';
import speechRoutes from './routes/speech.js';
import pronunciationRoutes from './routes/pronunciation.js';
import speakingPassageRoutes from './routes/speakingPassages.js';
import speakingAttemptRoutes from './routes/speakingAttempts.js';
import furiganaRoutes from './routes/furigana.js';
import writingRoutes from './routes/writing.js';


// Khoá ký token đăng nhập: thiếu thì không chạy (mọi token sẽ ký bằng "undefined"), ngắn thì cảnh báo.
if (!process.env.JWT_SECRET) {
  console.error('Thiếu JWT_SECRET trong .env — không thể khởi động an toàn.');
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.warn('[bảo mật] JWT_SECRET nên dài ít nhất 32 ký tự ngẫu nhiên (xem .env.example).');
}

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 5000;
const clientDistDir = path.resolve('dist');

// Kiểm tra kết nối MySQL
sequelize.authenticate()
  .then(async () => {
    console.log('MySQL connection has been established successfully.');
    await ensureDatabaseSchema();
    console.log('Database schema is ready.');
  })
  .catch((err) => {
    console.error('Unable to connect to the database:', err);
  });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadsDir = path.resolve('uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir, {
  // File nghe tải lên lưu đuôi `.mpeg` -> mặc định bị gán `video/mpeg`.
  // Đây là âm thanh MP3, khai báo đúng để thẻ <audio> không bị từ chối.
  setHeaders: (res, filePath) => {
    if (/\.(mpeg|mpga)$/i.test(filePath)) res.setHeader('Content-Type', 'audio/mpeg');
  }
}));
// File không có thì trả 404 thật. Trước đây rơi xuống route `*` của SPA và
// nhận về index.html kèm mã 200 -> trình duyệt tưởng có file, thẻ <audio>
// im lặng, không ai biết là mất file.
app.use('/uploads', (req, res) => res.status(404).json({ message: 'File not found' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/vocabulary', vocabularyRoutes);
// Khai niem "bai hoc" (lesson) da bo: bang `lessons` rong suot qua trinh phat
// trien, tab Lessons trong trang quan tri da tu tat tu truoc, va `exercises`
// khong co cot `lesson_id`. Da go /api/lessons va /api/grammar (model Grammar
// gan vao lesson, bang `grammar` khong ton tai trong MySQL).
// Ky nang NGU PHAP van chay binh thuong: no di qua `exercises.skill_type`,
// khong lien quan model Grammar.
app.use('/api/users', userRoutes);
app.use('/api/languages', languageRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/speech', speechRoutes);
// Chấm phát âm bằng model của đồ án. Dịch vụ Python riêng ở cổng 8000 —
// xem services/pronunciationService.js. Node không chạy được PyTorch nên
// không có cách nhúng model vào đây.
app.use('/api/pronunciation', pronunciationRoutes);
// Bai doc cho phan cham phat am. Bang rieng vi model can biet TRUOC cau
// nguoi hoc phai doc, con `exercises` chua de VSTEP.
app.use('/api/speaking-passages', speakingPassageRoutes);
// Lich su cham phat am. Bang `speaking_attempts`, moi 21/10/2026 -- truoc do
// cham xong la mat, ca hai ngon ngu. Luu SO DO THO chu khong chi luu diem, vi
// moc va san con co the doi. Xem models/SpeakingAttempt.js.
app.use('/api/speaking-attempts', speakingAttemptRoutes);
// Furigana (hiragana tren kanji) cho cau tieng Nhat. Xem services/furiganaService.js.
app.use('/api/furigana', furiganaRoutes);
// Chấm bài viết tiếng Anh cơ bản bằng LUẬT (LanguageTool chạy cùng `npm run
// dev`, cổng 8081), không dùng AI. Xem services/writingService.js.
app.use('/api/writing', writingRoutes);

if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.join(clientDistDir, 'index.html'));
  });
}

// Error Handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  // mốc khởi động trong nhật ký chấm trực tiếp, để đối chiếu giờ khi có lỗi (services/liveScoringLog.js)
  import('./services/liveScoringLog.js').then(({ logLiveScoring }) => logLiveScoring('node-start', { port: Number(PORT), pid: process.pid }));
});
