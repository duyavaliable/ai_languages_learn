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

export default uploadAudio;
