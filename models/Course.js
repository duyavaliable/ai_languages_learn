import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Course = sequelize.define('Course', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  language_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  name: { type: DataTypes.STRING(225), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  level: { type: DataTypes.STRING(225), allowNull: true },
  duration: { type: DataTypes.INTEGER, allowNull: true },
  is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
  tableName: 'courses',
  timestamps: false
});

export default Course;