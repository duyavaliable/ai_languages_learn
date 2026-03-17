import { DataTypes } from "sequelize";  
import sequelize from "../config/database.js";

const Lesson = sequelize.define('Lesson', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  course_id: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING(225), allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: true },
  lesson_order: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 1 },
  is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
  tableName: 'lessons',
  timestamps: false
}); 

export default Lesson;  