import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { User } from '../models/index.js';
import { passwordProblem, usernameProblem, isEmail } from '../utils/validation.js';

const VALID_ROLES = ['student', 'admin'];

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { is_deleted: false },
      attributes: { exclude: ['password'] },
      order: [['id', 'ASC']]
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDeletedUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { is_deleted: true },
      attributes: { exclude: ['password'] },
      order: [['id', 'ASC']]
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const restoreUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await user.update({ is_deleted: false, is_active: true });

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      is_deleted: user.is_deleted
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const softDeleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.id === req.user.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    await user.update({ is_deleted: true, is_active: false });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createUser = async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    const raw = req.body || {};
    if (typeof raw.username !== 'string' || typeof raw.email !== 'string' || typeof raw.password !== 'string') {
      return res.status(400).json({ message: 'Cần nhập tên người dùng, email và mật khẩu' });
    }
    const username = raw.username.trim();
    const email = raw.email.trim().toLowerCase();
    const { password } = raw;
    const problem = usernameProblem(username)
      || (isEmail(email) ? null : 'Email không hợp lệ')
      || passwordProblem(password, { email, username });
    if (problem) return res.status(400).json({ message: problem });

    const exists = await User.findOne({
      where: { [Op.or]: [{ email }, { username }] }
    });
    if (exists) {
      return res.status(400).json({ message: 'Email hoặc tên người dùng đã được sử dụng' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role,
      is_active: true
    });

    res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      is_active: user.is_active
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.id === req.user.id) {
      return res.status(400).json({ message: 'Cannot change your own role' });
    }

    await user.update({ role });

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      is_active: user.is_active
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const toggleUserLock = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.id === req.user.id) {
      return res.status(400).json({ message: 'Cannot lock your own account' });
    }

    await user.update({ is_active: !user.is_active });

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      is_active: user.is_active
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
