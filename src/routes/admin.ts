import { Router } from 'express';
import { getUsers } from '../controllers/adminController';
import { protect } from '../middleware/authMiddleware';
import { roleMiddleware } from '../middleware/roleMiddleware';

const router = Router();

// @route   GET /api/admin/users
// @desc    Get all users
// @access  Private (Admin)
router.get('/users', protect, roleMiddleware('admin'), getUsers);

export default router;
