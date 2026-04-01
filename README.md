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
- Gemini API (Google AI)
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

3. Create `.env` file with:
```env
PORT=5000
MYSQL_HOST=localhost
MYSQL_DATABASE=ai_languages_learn
MYSQL_USER=root
MYSQL_PASSWORD=your_password
JWT_SECRET=your_jwt_secret

# Gemini API key (required for AI exercise generation)
GEMINI_API_KEY=AIzaSy...
# Optional model override
GEMINI_MODEL=gemini-1.5-flash
```

4. Start app:
```bash
npm run dev
```

## AI Setup Guide (Gemini - Chi tiet)

1. Tao API key Gemini
- Vao Google AI Studio: https://aistudio.google.com/app/apikey
- Tao API key va copy key (thuong bat dau bang `AIza...`).

2. Cach 1: Dan key truc tiep vao code (theo dung yeu cau cua ban)
- Mo file `services/aiService.js`.
- Tim dong: `const HARDCODED_GEMINI_API_KEY = '';`
- Dan key vao giua dau nhay, vi du:
  - `const HARDCODED_GEMINI_API_KEY = 'AIzaSyxxxxxxxx';`
- Luu file va restart server `npm run dev`.

3. Cach 2: Dat key trong `.env` (an toan hon)
- Mo file `.env` o thu muc goc project.
- Them dong: `GEMINI_API_KEY=AIzaSy...`
- (Tuy chon) Them dong: `GEMINI_MODEL=gemini-1.5-flash`
- Luu file va khoi dong lai server `npm run dev`.

4. Vi tri code dang dung API key
- File service AI: `services/aiService.js`
- Thu tu uu tien key:
	- `HARDCODED_GEMINI_API_KEY` (dan truc tiep)
	- neu trong code rong thi moi dung `process.env.GEMINI_API_KEY`

5. Neu key sai hoac chua co
- API se bao loi: `Gemini API key is missing...` hoac `Gemini request failed...`.
- Kiem tra lai key va restart server.

## Luong hoc moi

1. Home page hien thi khoa hoc tieng Anh theo trinh do A2/B1/B2/C1.
2. Nguoi hoc bam vao khoa hoc se vao trang ky nang: Nghe, Noi, Doc, Viet.
3. Bam vao 1 ky nang se vao trang danh sach bai tap AI cua ky nang do.

## Teacher AI Exercise Workflow

Trang `TeacherCreateContent` da duoc sua de giao vien:

1. Chon khoa hoc (B1/B2/C1/A2).
2. Chon ky nang (reading/listening/writing/speaking).
3. Nhap so cau.
4. (Tuy chon) Nhap chu de phu.
5. Bam `Generate`.

He thong se:
- Tu dong lay CEFR level tu khoa hoc.
- Dung prompt AI co san, khong can giao vien tu nhap yeu cau dai.
- Tao bai tap dung ky nang + dung trinh do.
- Luu bai tap vao `lessons` voi metadata ky nang/CEFR de hien thi tren trang nguoi hoc.

## Prompt AI da duoc dong goi

Prompt nam trong `services/aiService.js` (ham `generateExercisesForCourseSkill`).

No bao gom:
- Muc tieu: tao bai tap tieng Anh theo skill + CEFR.
- Rang buoc output JSON chuan.
- Cau truc ket qua bat buoc: `question`, `options`, `correctAnswer`, `explanation`.
- Quy tac cho speaking/writing: `options` la mang rong.

Vi vay giao vien chi can thao tac chon, khong can viet prompt thu cong.
