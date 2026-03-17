import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const UserProgress = sequelize.define('UserProgress', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  lesson_id: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.TINYINT, allowNull: true},
  score: { type: DataTypes.DECIMAL(5,2), allowNull: true, defaultValue: 0.00 },
  time_spent: { type: DataTypes.INTEGER, allowNull: true },
  last_accessed: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'user_progress',
  timestamps: false
});

export default UserProgress;