import { Router } from 'express';
import { getProductById, uploadImage, getProducts, getAllProducts } from '../controllers/productController';
import { protect } from '../middleware/authMiddleware';
import upload from '../config/multer';
import { roleMiddleware } from '../middleware/roleMiddleware';

const router = Router();

router.post('/upload', protect, roleMiddleware('farmer'), upload.single('image'), uploadImage);
// router.post('/', protect, roleMiddleware('farmer'), createProduct);
router.get('/all', getProducts);
router.get("/", getAllProducts);
// router.get('/seller', protect, roleMiddleware('farmer'), getSellerProducts);
router.get('/:id', getProductById);
// router.put('/:id', protect, roleMiddleware('farmer'), updateProduct);
// router.delete('/:id', protect, roleMiddleware('farmer'), deleteProduct);

export default router;
