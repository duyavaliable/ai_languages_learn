import User from './User.js';
import Language from './Language.js';
import Lesson from './Lesson.js';
import Exercise from './Exercise.js';
import Vocabulary from './Vocabulary.js';
import UserProgress from './UserProgress.js';

// Lesson - Language
Lesson.belongsTo(Language, { foreignKey: 'language_id', as: 'language' });
Language.hasMany(Lesson, { foreignKey: 'language_id', as: 'lessons' });

// Exercise - Language
Exercise.belongsTo(Language, { foreignKey: 'language_id', as: 'language' });
Language.hasMany(Exercise, { foreignKey: 'language_id', as: 'exercises' });

// Vocabulary - Lesson
Vocabulary.belongsTo(Lesson, { foreignKey: 'lesson_id', as: 'lesson' });

// UserProgress - User, Lesson
UserProgress.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
UserProgress.belongsTo(Lesson, { foreignKey: 'lesson_id', as: 'lesson' });

export { User, Language, Lesson, Exercise, Vocabulary, UserProgress };