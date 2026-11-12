import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Exercise = sequelize.define('Exercise', {
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
  // 'read_aloud' = doc to van ban cho san (model cham phat am)
  // 'free'/null   = de noi tu do VSTEP, khong co van ban dich
  speaking_mode: { type: DataTypes.STRING(16), allowNull: true },

  // Bat buoc cho bai lay tu nguon ngoai -- do an phai trich dan duoc.
  source: { type: DataTypes.STRING(500), allowNull: true },
  license: { type: DataTypes.STRING(200), allowNull: true },
  attribution: { type: DataTypes.TEXT, allowNull: true },

  // Chi true khi MOI dong deu co moc nguoi ban ngu -> cham duoc ca bon tieu
  // chi. Phai khop `GET /ja/sentences`; dung tu bat bang tay.
  has_prosody_ref: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
  tableName: 'exercises',
  timestamps: false
});

export default Exercise;
