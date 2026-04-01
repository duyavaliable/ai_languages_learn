import { DataTypes } from "sequelize";  
import sequelize from "../config/database.js";

const Lesson = sequelize.define('Lesson', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  course_id: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING(225), allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: true },
  lesson_order: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 1 },
  skill_type: { type: DataTypes.STRING(32), allowNull: true },
  cefr_level: { type: DataTypes.STRING(16), allowNull: true },
  is_ai_exercise: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
  tableName: 'lessons',
  timestamps: false
}); 

export default Lesson;  