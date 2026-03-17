import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { User } from '../models/index.js';

const STAFF_ROLES = ['teacher', 'admin'];

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

const registerWithRole = async (req, res, role) => {
  try {
    const { username, email, password } = req.body;

    if (username == null || email == null || password == null) {
      return res.status(400).json({ message: 'username, email and password are required' });
    }

    const userExists = await User.findOne({
      where: { [Op.or]: [{ email }, { username }] }
    });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role
    });

    const token = generateToken(user.id);

    return res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      token
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const register = async (req, res) => {
  return registerWithRole(req, res, 'student');
};

export const registerTeacher = async (req, res) => {
  return registerWithRole(req, res, 'teacher');
};

export const registerAdmin = async (req, res) => {
  return registerWithRole(req, res, 'admin');
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // So sánh password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.is_deleted) {
      return res.status(403).json({ message: 'Account has been deleted' });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: 'Account is locked' });
    }

    const token = generateToken(user.id);

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      token
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createStaffAccount = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (username == null || email == null || password == null || role == null) {
      return res.status(400).json({ message: 'username, email, password and role are required' });
    }

    if (!STAFF_ROLES.includes(role)) {
      return res.status(400).json({ message: 'role must be teacher or admin' });
    }

    const userExists = await User.findOne({
      where: { [Op.or]: [{ email }, { username }] }
    });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role
    });

    res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
