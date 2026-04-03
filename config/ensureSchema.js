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

  const queryInterface = sequelize.getQueryInterface();
  const allTables = await queryInterface.showAllTables();
  const tableNames = allTables.map((item) => (typeof item === 'string' ? item : item.tableName));

  if (!tableNames.includes('exercises')) {
    await queryInterface.createTable('exercises', {
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
    });
  } else {
    await ensureColumn('exercises', 'task_prompt', {
      type: DataTypes.TEXT('long'),
      allowNull: true
    });

    await ensureColumn('exercises', 'audio_url', {
      type: DataTypes.STRING(500),
      allowNull: true
    });

    await ensureColumn('exercises', 'sample_answer', {
      type: DataTypes.TEXT('long'),
      allowNull: true
    });

  }
};