import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Exercise = sequelize.define('Exercise', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  course_id: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING(225), allowNull: false },
  skill_type: { type: DataTypes.STRING(32), allowNull: false },
  cefr_level: { type: DataTypes.STRING(16), allowNull: false },
  topic: { type: DataTypes.STRING(255), allowNull: true },
  reading_passage: { type: DataTypes.TEXT('long'), allowNull: true },
  task_prompt: { type: DataTypes.TEXT('long'), allowNull: true },
  sample_answer: { type: DataTypes.TEXT('long'), allowNull: true },
  audio_url: { type: DataTypes.STRING(500), allowNull: true },
  questions_json: { type: DataTypes.TEXT('long'), allowNull: false },
  time_limit_sec: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 900 },
  is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
  tableName: 'exercises',
  timestamps: false
});

export default Exercise;
