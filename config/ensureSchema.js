import sequelize from './database.js';
import { DataTypes } from 'sequelize';

const ensureColumn = async (tableName, columnName, definition) => {
  const queryInterface = sequelize.getQueryInterface();
  const table = await queryInterface.describeTable(tableName);

  if (!table[columnName]) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
};

export const ensureDatabaseSchema = async () => {
  await ensureColumn('lessons', 'skill_type', {
    type: DataTypes.STRING(32),
    allowNull: true
  });

  await ensureColumn('lessons', 'cefr_level', {
    type: DataTypes.STRING(16),
    allowNull: true
  });

  await ensureColumn('lessons', 'is_ai_exercise', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  });
};
//giải thích 