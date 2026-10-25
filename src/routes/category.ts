import { Router } from 'express';
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  toggleCategoryStatus,
  deleteCategory,
  createSubcategory,
  updateSubcategory,
  toggleSubcategoryStatus,
  deleteSubcategory,
  reorderCategories,
} from '../controllers/categoryController';
import { protect } from '../middleware/authMiddleware';
import { roleMiddleware } from '../middleware/roleMiddleware';

const router = Router();

// Public / Seller Category endpoints
router.get('/', getCategories);
router.get('/:id', getCategoryById);

// Admin Category Management
router.post('/', protect, roleMiddleware('admin'), createCategory);
router.put('/:id', protect, roleMiddleware('admin'), updateCategory);
router.patch('/:id/status', protect, roleMiddleware('admin'), toggleCategoryStatus);
router.delete('/:id', protect, roleMiddleware('admin'), deleteCategory);
router.post('/reorder', protect, roleMiddleware('admin'), reorderCategories);

// Admin Subcategory Management
router.post('/:id/subcategories', protect, roleMiddleware('admin'), createSubcategory);
router.put('/subcategories/:subId', protect, roleMiddleware('admin'), updateSubcategory);
router.patch('/subcategories/:subId/status', protect, roleMiddleware('admin'), toggleSubcategoryStatus);
router.delete('/subcategories/:subId', protect, roleMiddleware('admin'), deleteSubcategory);

export default router;
