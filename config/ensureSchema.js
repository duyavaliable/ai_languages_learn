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

  // Bang `lessons` KHONG con duoc tao: khai niem "bai hoc" da bo (xem
  // models/index.js). Bang cu neu con trong MySQL thi de nguyen, khong drop --
  // xoa bang la thao tac huy du lieu, de chu du an tu quyet dinh.

  if (!tableNames.includes('exercises')) {
    await queryInterface.createTable('exercises', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      course_id: { type: DataTypes.INTEGER, allowNull: false },
      language_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      title: { type: DataTypes.STRING(225), allowNull: false },
      skill_type: { type: DataTypes.STRING(32), allowNull: false },
      reading_passage: { type: DataTypes.TEXT('long'), allowNull: true },
      task_prompt: { type: DataTypes.TEXT('long'), allowNull: true },
      sample_answer: { type: DataTypes.TEXT('long'), allowNull: true },
      audio_url: { type: DataTypes.STRING(500), allowNull: true },
      questions_json: { type: DataTypes.TEXT('long'), allowNull: false },
      time_limit_sec: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 900 },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
    });
  } else {
    await ensureColumn('exercises', 'language_id', {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    });

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

    // --- Bai Noi (bai doc) cho phan cham phat am: luu o `exercises` ---
    //
    // Truoc day bai doc cua ky nang Noi nam o bang rieng `speaking_passages`.
    // Ly do khi tach ("model train tren cau toi da 10 tu") do lai la SAI: muc 9
    // cua SO_LIEU_HIEN_HANH.md do cau 13-30 tu cho 0/77 co oan, va
    // `PassageSession` luon dua MOT CAU cho model. Da gop het vao `exercises`
    // va XOA bang `speaking_passages` (16/11/2026; ban sao luu o backup/).
    //
    // `speaking_mode` = 'read_aloud': gia tri dinh danh cua bai Noi (bai doc theo
    // van ban cho san, model cham phat am). NULL chi con o vai dong VSTEP cu da
    // xoa mem (dang "noi tu do" da go khoi he thong).
    await ensureColumn('exercises', 'speaking_mode', {
      type: DataTypes.STRING(16),
      allowNull: true
    });

    // Do an phai trich dan duoc moi nguon lieu -> bat buoc co cho luu.
    await ensureColumn('exercises', 'source', {
      type: DataTypes.STRING(500),
      allowNull: true
    });
    await ensureColumn('exercises', 'license', {
      type: DataTypes.STRING(200),
      allowNull: true
    });
    await ensureColumn('exercises', 'attribution', {
      type: DataTypes.TEXT,
      allowNull: true
    });

    // Giu lam COT THAT chu khong nhet vao JSON: day la truong de dat sai nhat.
    // No phai khop voi `GET /ja/sentences` cua dich vu cham; de trong JSON thi
    // khong truy van kiem chung duoc.
    await ensureColumn('exercises', 'has_prosody_ref', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
  }

  // Bang `speaking_passages` da xoa (16/11/2026): bai Noi luu o `exercises`
  // (skill_type 'speaking'). KHONG tao lai bang nay.

  // MOT LAN DOC BAI NOI DA DUOC CHAM. Bang moi 21/10/2026.
  //
  // Truoc do san pham KHONG luu ket qua cham phat am o dau ca. Trong MySQL co
  // `exercise_progress` va `flashcard_progress` nhung KHONG dong code nao
  // trong du an doc/ghi chung (da kiem 21/10/2026), va `exercise_progress`
  // chi co mot cot `score decimal(5,2)` -- khong chua noi nhung gi phep cham
  // nay sinh ra.
  //
  // LUU SO DO THO, KHONG CHI LUU DIEM. Diem do troi chay la anh xa cua
  // `hesitation_rate` qua moc `anchor_p90` va san `anchor_min_words`; hai so
  // do CON CO THE DOI. Chi luu diem thi moi lan doi moc la toan bo lich su cu
  // khong so duoc voi cai moi. Xem models/SpeakingAttempt.js.
  if (!tableNames.includes('speaking_attempts')) {
    await queryInterface.createTable('speaking_attempts', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      exercise_id: { type: DataTypes.INTEGER, allowNull: true },
      language_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      mode: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'passage' },
      scoring_scale: { type: DataTypes.STRING(24), allowNull: true },
      total_score: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      total_label: { type: DataTypes.STRING(64), allowNull: true },
      not_scored_reason: { type: DataTypes.TEXT, allowNull: true },
      n_words: { type: DataTypes.INTEGER, allowNull: true },
      n_hesitations: { type: DataTypes.INTEGER, allowNull: true },
      hesitation_rate: { type: DataTypes.DECIMAL(6, 4), allowNull: true },
      intra_word_count: { type: DataTypes.INTEGER, allowNull: true },
      anchor_p90: { type: DataTypes.DECIMAL(6, 4), allowNull: true },
      anchor_min_words: { type: DataTypes.INTEGER, allowNull: true },
      word_flag_rate: { type: DataTypes.DECIMAL(6, 4), allowNull: true },
      word_flags_json: { type: DataTypes.TEXT, allowNull: true },
      en_scores_json: { type: DataTypes.TEXT, allowNull: true },
      raw_json: { type: DataTypes.TEXT('long'), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
    await queryInterface.addIndex('speaking_attempts', ['user_id', 'exercise_id']);
    await queryInterface.addIndex('speaking_attempts', ['user_id', 'language_id']);
  }

  // Xoa mem cho tu vung. Bang `vocabulary` von khong co cot nay, nen DELETE
  // phai xoa cung -- khac quy uoc cua `exercises`/`lessons`. Them vao de ba
  // bang cung mot cach hanh xu: xoa mem truoc, xoa cung la buoc rieng.
  if (tableNames.includes('vocabulary')) {
    await ensureColumn('vocabulary', 'is_deleted', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
  }
};
