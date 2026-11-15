# Lingua — English & Japanese Learning App

A platform for practicing English and Japanese by skill. It does not call any external AI service.

## Features

- 🎧 Listening / 📖 Reading / grammar / vocabulary: exams imported from PDF/DOCX files (scanned with OCR,
  reviewed by an admin before saving), displayed like the original exam.
- 🎤 Speaking: reading passages, scored for pronunciation by the project's own model
  (separate Python service, `/api/pronunciation`).
- ✍️ Writing: rule-based checking with LanguageTool (runs locally).
- 👤 Accounts: email/password or Google sign-in; roles `admin` and `student`.

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

## Services used by `npm run dev`

| Service | Port | Notes |
|---|---|---|
| Vite client | 3000 | React UI |
| Express server | 5000 | API, `uploads/` |
| LanguageTool | 8081 | writing check, `npm run lt:setup` once |
| Pronunciation model (Python) | 8000 | started separately (`serve.py`), see `PRONUNCIATION_SERVICE_URL` |
| PDF exam scanner (Python, PaddleOCR) | — | `SCAN_PYTHON`, requirements in `services/scan/requirements.txt` |

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
