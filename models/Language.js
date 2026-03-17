import { DataTypes } from "sequelize";  
import sequelize from "../config/database.js";

const Language = sequelize.define('Language', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  code: { type: DataTypes.STRING(10), allowNull: false, unique: true }
}, {
  tableName: 'languages',
  timestamps: false
}); 

export default Language;  