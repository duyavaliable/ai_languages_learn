import path from 'path';
import { tmpdir } from 'os';

const isVercelRuntime = process.env.VERCEL === '1';

export const getUploadsRootDir = () => {
  if (process.env.UPLOADS_DIR) {
    return path.resolve(process.env.UPLOADS_DIR);
  }

  if (isVercelRuntime) {
    return path.join(tmpdir(), 'uploads');
  }

  return path.resolve('uploads');
};

export const getUploadsAudioDir = () => path.join(getUploadsRootDir(), 'audio');

export const toPublicAudioUrl = (fileName) => `/uploads/audio/${fileName}`;