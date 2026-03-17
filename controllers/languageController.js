import { Op } from 'sequelize';
import { Language } from '../models/index.js';

const SUPPORTED_LANGUAGES = [
  { name: 'Tiếng Anh', code: 'en' },
  { name: 'Tiếng Nhật', code: 'ja' }
];

const ensureSupportedLanguages = async () => {
  for (const item of SUPPORTED_LANGUAGES) {
    const [language, created] = await Language.findOrCreate({
      where: { code: item.code },
      defaults: item
    });

    if (!created && language.name !== item.name) {
      await language.update({ name: item.name });
    }
  }
};

export const getLanguages = async (req, res) => {
  try {
    await ensureSupportedLanguages();

    const languages = await Language.findAll({
      where: {
        code: {
          [Op.in]: SUPPORTED_LANGUAGES.map((item) => item.code)
        }
      },
      order: [['code', 'ASC']]
    });

    res.json(languages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
