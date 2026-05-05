import User from './User.js';
import Language from './Language.js';
import Lesson from './Lesson.js';
import Exercise from './Exercise.js';
import Vocabulary from './Vocabulary.js';
import Grammar from './Grammar.js';
import UserProgress from './UserProgress.js';

// Lesson - Language (simplified lesson structure)
Lesson.belongsTo(Language, { foreignKey: 'language_id', as: 'language' });
Language.hasMany(Lesson, { foreignKey: 'language_id', as: 'lessons' });

// Exercise keeps course_id as a legacy grouping key.

// Vocabulary - Lesson
Vocabulary.belongsTo(Lesson, { foreignKey: 'lesson_id', as: 'lesson' });
Lesson.hasMany(Vocabulary, { foreignKey: 'lesson_id', as: 'vocabularyItems' });

// Grammar - Lesson
Grammar.belongsTo(Lesson, { foreignKey: 'lesson_id', as: 'lesson' });
Lesson.hasMany(Grammar, { foreignKey: 'lesson_id', as: 'grammarPoints' });

// UserProgress - User, Lesson
UserProgress.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
UserProgress.belongsTo(Lesson, { foreignKey: 'lesson_id', as: 'lesson' });

export { User, Language, Lesson, Exercise, Vocabulary, Grammar, UserProgress };