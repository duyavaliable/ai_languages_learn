# AI Language Learning App

A comprehensive language learning platform powered by AI, featuring personalized lessons, vocabulary training, grammar explanations, and pronunciation feedback.

## Features

- 🤖 AI-powered explanations and exercises
- 📚 Structured courses and lessons
- 📖 Vocabulary and grammar tracking
- 🎤 Pronunciation evaluation
- 📊 Progress tracking
- 🏆 Streak system and achievements

## Tech Stack

### Backend
- Node.js + Express
- MySQL + Sequelize
- JWT Authentication

### Frontend
- React
- Vite
- Axios
- React Router

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Copy `.env.example` to `.env` and fill in the values (MySQL, a random `JWT_SECRET` of 32+ characters,
   optional `GOOGLE_CLIENT_ID`...). Never commit `.env` and never paste keys into code.

4. Download LanguageTool once (used to check writing, ~250 MB, not in git):
```bash
npm run lt:setup
```

5. Start app (client on :3000, server on :5000, LanguageTool on :8081):
```bash
npm run dev
```

6. First admin account: open `/register-admin` while the database has no admin yet. After that the
   endpoint is closed; more admins are created from the account management page.

Not in git (stay on the local machine only): `uploads/` (audio, scanned exam images),
`public/images/jlpt/` (images cut from copyrighted exams), `logs/`,
`tools/` (LanguageTool), `*.traineddata` (tesseract cache, downloaded automatically).

## Third-party data

- `services/data/en_wordfreq.txt` — English word frequencies exported from the
  [wordfreq](https://github.com/rspeer/wordfreq) project by Robyn Speer (data licensed
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)). Used offline to auto-fix typos in
  imported English exams. This file stays under CC BY-SA 4.0.
- `services/scan/kanji_neighbors.json` — table of visually similar kanji used by the exam scanner to
  double-check OCR results (generated for this project).

## Account security

- Passwords: 8–72 characters with at least one letter and one digit, not equal to the email or username
  (shared rule in `utils/validation.js`, checked by both server and pages). Stored with bcrypt (cost 12).
- Login / sign-up / password change are rate-limited per IP (`middleware/rateLimit.js`).
- Login tokens expire after 7 days and become invalid as soon as the password is changed.

## Luong hoc moi

1. Home page hien thi khoa hoc tieng Anh theo trinh do A2/B1/B2/C1.
2. Nguoi hoc bam vao khoa hoc se vao trang ky nang: Nghe, Noi, Doc, Viet.
3. Bam vao 1 ky nang se vao trang danh sach bai tap AI cua ky nang do.

## Teacher AI Exercise Workflow

Trang `TeacherCreateContent` da duoc sua de giao vien:

1. Chon khoa hoc (B1/B2/C1/A2).
2. Chon ky nang (reading/listening/writing/speaking).
3. Tai file PDF/DOCX de quet PARTs.
4. Chon mot hoac nhieu PART bang cac card hien thi.
5. Bam `Tao ... bai` de tao mot bai rieng cho moi PART da chon.

He thong se:
- Tu dong lay CEFR level tu khoa hoc.
- Dung prompt AI co san theo tung PART, khong can giao vien tu nhap prompt dai.
- Tao mot exercise rieng cho moi PART da chon, de hien thi thanh nhieu card trong danh sach.
- Luu bai tap voi metadata ky nang/CEFR de hien thi tren trang nguoi hoc.

## OCR Support for Exercise Uploads

Exercise file preview co ho tro PDF dang anh (scanned PDF) thong qua OCR.

Can:

1. Cai package JS:
```bash
npm install tesseract.js
```

2. Cai `pdftoppm` (Poppler) tren may/server:
- Windows: `choco install poppler -y`
- Ubuntu/Debian: `sudo apt install poppler-utils`
- macOS: `brew install poppler`

Neu thieu `pdftoppm`, he thong van co the preview neu file PDF co text san, nhung OCR cho PDF dang anh se khong chay.

## Prompt AI da duoc dong goi

Prompt nam trong `services/aiService.js` (ham `generateExercisesForCourseSkill`).

No bao gom:
- Muc tieu: tao bai tap tieng Anh theo skill + CEFR.
- Rang buoc output JSON chuan.
- Cau truc ket qua bat buoc: `question`, `options`, `correctAnswer`, `explanation`.
- Quy tac cho speaking/writing: `options` la mang rong.

Vi vay giao vien chi can thao tac chon, khong can viet prompt thu cong.
