import { Router } from 'express';
import { createOrder, getMyOrders, getSellerOrders, updateOrderStatus } from '../controllers/orderController';
import { protect } from '../middleware/authMiddleware';
import { roleMiddleware } from '../middleware/roleMiddleware';

const router = Router();

// @route   POST /api/orders
// @desc    Create a new order
// @access  Private
router.post('/', protect, createOrder);

// @route   GET /api/orders/my-orders
// @desc    Get all orders for the current user
// @access  Private
router.get('/my-orders', protect, getMyOrders);

// @route   GET /api/orders/seller
// @desc    Get all orders for the current seller
// @access  Private (Seller)
router.get('/seller', protect, roleMiddleware('seller'), getSellerOrders);

// @route   PUT /api/orders/seller/:orderId
// @desc    Update an order's status
// @access  Private (Seller)
router.put('/seller/:orderId', protect, roleMiddleware('seller'), updateOrderStatus);

export default router;
