import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  username: { type: DataTypes.STRING(225), allowNull: false},
  email: { type: DataTypes.STRING(225), allowNull: false },
  password: { type: DataTypes.STRING(225), allowNull: false },
  role: { type: DataTypes.STRING(100), allowNull: false },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, {
  timestamps: false,
  tableName: 'users'
});

export default User;  
