import { Router } from 'express';
import {
  getBlogs,
  getBlogBySlug,
  getBlogById,
  getAllBlogsAdmin,
  createBlog,
  updateBlog,
  deleteBlog,
  uploadBlogImage,
} from '../controllers/blogController';
import { protect } from '../middleware/authMiddleware';
import { roleMiddleware } from '../middleware/roleMiddleware';
import upload from '../config/multer';

const router = Router();

// Middleware to catch Multer errors gracefully
const handleBlogImageUpload = (req: any, res: any, next: any) => {
  upload.single('image')(req, res, (err: any) => {
    if (err) {
      console.error('Blog image upload error:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'ছবি আপলোড করতে ব্যর্থ হয়েছে',
      });
    }
    next();
  });
};

// Public routes
router.get('/', getBlogs);
router.get('/slug/:slug', getBlogBySlug);

// Admin-only routes (add, edit, delete, upload)
router.get('/admin/all', protect as any, roleMiddleware('admin') as any, getAllBlogsAdmin as any);
router.post('/upload', protect as any, roleMiddleware('admin') as any, handleBlogImageUpload, uploadBlogImage as any);
router.post('/', protect as any, roleMiddleware('admin') as any, createBlog as any);
router.put('/:id', protect as any, roleMiddleware('admin') as any, updateBlog as any);
router.delete('/:id', protect as any, roleMiddleware('admin') as any, deleteBlog as any);

// Fallback single blog by ID
router.get('/:id', getBlogById);

export default router;
