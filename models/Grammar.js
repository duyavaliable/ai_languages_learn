import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Grammar = sequelize.define('Grammar', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lesson_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  title: { type: DataTypes.STRING(225), allowNull: false },
  structure: { type: DataTypes.STRING(225), allowNull: true },
  explanation: { type: DataTypes.TEXT, allowNull: false },
  example_sentence: { type: DataTypes.TEXT, allowNull: false },
  example_translation: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'grammar',
  timestamps: false
});

export default Grammar;