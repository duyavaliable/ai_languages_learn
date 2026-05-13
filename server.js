import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { getUploadsRootDir } from './utils/storage.js';

import sequelize from './config/database.js'; // Import sequelize instance
import { ensureDatabaseSchema } from './config/ensureSchema.js';
import errorHandler from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import courseRoutes from './routes/courses.js';
import lessonRoutes from './routes/lessons.js';
import vocabularyRoutes from './routes/vocabulary.js';
import userRoutes from './routes/users.js';
import languageRoutes from './routes/languages.js';
import aiRoutes from './routes/ai.js';
import exerciseRoutes from './routes/exercises.js';
import speechRoutes from './routes/speech.js';


const app = express();
const PORT = process.env.PORT || 5000;
const clientDistDir = path.resolve('dist');
const isVercelRuntime = process.env.VERCEL === '1';
let appInitPromise;

export const initApp = async () => {
  if (!appInitPromise) {
    appInitPromise = (async () => {
      await sequelize.authenticate();
      console.log('MySQL connection has been established successfully.');
      await ensureDatabaseSchema();
      console.log('Database schema is ready.');
    })().catch((err) => {
      appInitPromise = null;
      console.error('Unable to connect to the database:', err);
      throw err;
    });
  }

  return appInitPromise;
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadsDir = getUploadsRootDir();
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/vocabulary', vocabularyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/languages', languageRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/speech', speechRoutes);

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

if (!isVercelRuntime) {
  initApp()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Server startup failed:', err);
      process.exit(1);
    });
}

export default app;
