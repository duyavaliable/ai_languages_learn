import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';

import sequelize from './config/database.js'; // Import sequelize instance
import errorHandler from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import courseRoutes from './routes/courses.js';
import lessonRoutes from './routes/lessons.js';
import vocabularyRoutes from './routes/vocabulary.js';
import grammarRoutes from './routes/grammar.js';
import userRoutes from './routes/users.js';
import languageRoutes from './routes/languages.js';
// import aiRoutes from './routes/ai.js';


const app = express();
const PORT = process.env.PORT || 5000;

// Kiểm tra kết nối MySQL
sequelize.authenticate()
  .then(() => {
    console.log('MySQL connection has been established successfully.');
  })
  .catch((err) => {
    console.error('Unable to connect to the database:', err);
  });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/vocabulary', vocabularyRoutes);
app.use('/api/grammar', grammarRoutes);
app.use('/api/users', userRoutes);
app.use('/api/languages', languageRoutes);
// app.use('/api/ai', aiRoutes);

// Error Handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
