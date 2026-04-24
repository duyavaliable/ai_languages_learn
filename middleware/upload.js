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
  'audio/x-m4a'
]);

const uploadAudio = multer({
  storage,
  limits: {
    fileSize: 30 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedAudioTypes.has(file.mimetype)) {
      return cb(new Error('Only audio files are allowed for listening exercises'));
    }
    cb(null, true);
  }
});

const allowedVocabularyTypes = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
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
