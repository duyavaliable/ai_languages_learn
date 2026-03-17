import express from 'express';
import { getAllUsers, getDeletedUsers, createUser, updateUserRole, toggleUserLock, softDeleteUser, restoreUser } from '../controllers/userController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes below require admin
router.use(protect, authorize('admin'));

router.get('/', getAllUsers);
router.get('/deleted', getDeletedUsers);
router.post('/', createUser);
router.patch('/:id/role', updateUserRole);
router.patch('/:id/toggle-lock', toggleUserLock);
router.patch('/:id/restore', restoreUser);
router.delete('/:id', softDeleteUser);

export default router;
