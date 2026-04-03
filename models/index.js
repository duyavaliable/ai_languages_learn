import User from './User.js';
import Language from './Language.js';
import Course from './Course.js';
import Lesson from './Lesson.js';
import Exercise from './Exercise.js';
import Vocabulary from './Vocabulary.js';
import Grammar from './Grammar.js';
import UserProgress from './UserProgress.js';


// Course - Language
Course.belongsTo(Language, { foreignKey: 'language_id', as: 'language' });
Language.hasMany(Course, { foreignKey: 'language_id' });

// Lesson - Course
Lesson.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
Course.hasMany(Lesson, { foreignKey: 'course_id', as: 'lessons' });

// Exercise - Course
Exercise.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
Course.hasMany(Exercise, { foreignKey: 'course_id', as: 'exercises' });

// Vocabulary - Lesson
Vocabulary.belongsTo(Lesson, { foreignKey: 'lesson_id', as: 'lesson' });
Lesson.hasMany(Vocabulary, { foreignKey: 'lesson_id', as: 'vocabularyItems' });

// Grammar - Lesson
Grammar.belongsTo(Lesson, { foreignKey: 'lesson_id', as: 'lesson' });
Lesson.hasMany(Grammar, { foreignKey: 'lesson_id', as: 'grammarPoints' });

// UserProgress - User, Course
UserProgress.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
UserProgress.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });

export { User, Language, Course, Lesson, Exercise, Vocabulary, Grammar, UserProgress };