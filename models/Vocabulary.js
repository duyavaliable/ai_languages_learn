import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Vocabulary = sequelize.define('Vocabulary', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lesson_id: { type: DataTypes.INTEGER, allowNull: false },
  word: { type: DataTypes.STRING(225), allowNull: false },
  pronunciation: { type: DataTypes.STRING(225), allowNull: true },
  meaning: { type: DataTypes.TEXT, allowNull: false },
  example_sentence: { type: DataTypes.TEXT, allowNull: true },
  example_translation: { type: DataTypes.TEXT, allowNull: true },
  audio_url: { type: DataTypes.STRING(225), allowNull: true }
}, {
  tableName: 'vocabulary',
  timestamps: false
});

export default Vocabulary;