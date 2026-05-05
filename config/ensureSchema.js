import sequelize from './database.js';
import { DataTypes } from 'sequelize';

const ensureColumn = async (tableName, columnName, definition) => {
  const queryInterface = sequelize.getQueryInterface();
  const table = await queryInterface.describeTable(tableName);

  if (!table[columnName]) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
};

const dropTableIfExists = async (tableName) => {
  const queryInterface = sequelize.getQueryInterface();
  const allTables = await queryInterface.showAllTables();
  const tableNames = allTables.map((item) => (typeof item === 'string' ? item : item.tableName));

  if (tableNames.includes(tableName)) {
    await queryInterface.dropTable(tableName);
  }
};

export const ensureDatabaseSchema = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const allTables = await queryInterface.showAllTables();
  const tableNames = allTables.map((item) => (typeof item === 'string' ? item : item.tableName));

  // Create simplified lessons table (linked to languages)
  if (!tableNames.includes('lessons')) {
    await queryInterface.createTable('lessons', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      language_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      title: { type: DataTypes.STRING(225), allowNull: false },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
    });
  } else {
    // Ensure language_id column exists in existing lessons table
    await ensureColumn('lessons', 'language_id', {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true // Allow null temporarily for existing records
    });
  }

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