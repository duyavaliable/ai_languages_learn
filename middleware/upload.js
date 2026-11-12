import multer from 'multer';

const storage = multer.memoryStorage();

const allowedAudioTypes = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/wave',
  'audio/vnd.wave',
  'audio/aac',
  'audio/x-aac'
]);
// trình duyệt / Windows có khi gửi loại file rỗng hoặc application/octet-stream: nhận theo đuôi file
const AUDIO_NAME_RE = /\.(mp3|wav|m4a|mp4|aac|ogg|oga|webm)$/i;

// File nghe cả đề (JLPT, IELTS…) thường 30–80 MB -> giới hạn 150 MB mỗi file
const AUDIO_MAX_MB = 150;
const uploadAudio = multer({
  storage,
  limits: {
    fileSize: AUDIO_MAX_MB * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedAudioTypes.has(file.mimetype) && !AUDIO_NAME_RE.test(String(file.originalname || ''))) {
      const err = new Error(`File "${file.originalname}" không phải file âm thanh (nhận mp3, wav, m4a, aac, ogg, webm)`);
      err.uploadRejected = true;
      return cb(err);
    }
    cb(null, true);
  }
});
export { AUDIO_MAX_MB };

const allowedVocabularyTypes = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
  'text/plain'
]);

function isAllowedVocabularyFile(file) {
  const mimetype = String(file?.mimetype || '').toLowerCase();
  const name = String(file?.originalname || '').toLowerCase();

  if (allowedVocabularyTypes.has(mimetype)) {
    if (mimetype === 'application/octet-stream') {
      return /\.(pdf|docx|txt)$/i.test(name);
    }
    return true;
  }

  return /\.(pdf|docx|txt)$/i.test(name);
}

const uploadVocabulary = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedVocabularyFile(file)) {
      return cb(new Error('Only PDF, DOCX or TXT files are allowed for vocabulary upload'));
    }
    cb(null, true);
  }
});

export default uploadAudio;
export { uploadVocabulary };
