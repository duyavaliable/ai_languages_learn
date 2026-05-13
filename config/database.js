import dotenv from 'dotenv';
dotenv.config();

import { Sequelize } from 'sequelize';

const useSsl = String(process.env.MYSQL_SSL || '').toLowerCase() === 'true';

const sequelize = new Sequelize(
  process.env.MYSQL_DATABASE,
  process.env.MYSQL_USER,
  process.env.MYSQL_PASSWORD,
  {
    host: process.env.MYSQL_HOST || 'localhost',
    dialect: 'mysql',
    port: Number(process.env.MYSQL_PORT || 3306),
    logging: false,
    dialectOptions: useSsl
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false
          }
        }
      : undefined,
  }
);

export default sequelize;
