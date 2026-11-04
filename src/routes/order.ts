import { Router } from 'express';
import {
  createOrder,
  getMyOrders,
  getSellerOrders,
  getOrderDetails,
  updateOrderStatus,
  cancelMyOrder,
  requestOrderReturn,
  getOrderStatusStats,
} from '../controllers/orderController';
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
// @access  Private (Seller, Admin)
router.get('/seller', protect, roleMiddleware('seller', 'admin'), getSellerOrders);

// @route   GET /api/orders/stats/summary
// @desc    Get aggregated order status stats
// @access  Private
router.get('/stats/summary', protect, getOrderStatusStats);

// @route   GET /api/orders/:orderId
// @desc    Get order details & tracking info
// @access  Private (Owner, Seller, Admin)
router.get('/:orderId', protect, getOrderDetails);

// @route   PUT /api/orders/:orderId/cancel
// @desc    Customer self-cancellation for 'pending' / 'confirmed' orders
// @access  Private
router.put('/:orderId/cancel', protect, cancelMyOrder);

// @route   POST /api/orders/:orderId/return
// @desc    Customer request return on delivered order
// @access  Private
router.post('/:orderId/return', protect, requestOrderReturn);

// @route   PUT /api/orders/seller/:orderId
// @desc    Update an order/shipment status
// @access  Private (Seller, Admin)
router.put('/seller/:orderId', protect, roleMiddleware('seller', 'admin'), updateOrderStatus);

// @route   PUT /api/orders/:orderId/status
// @desc    Update an order/shipment status (generic alias)
// @access  Private (Seller, Admin)
router.put('/:orderId/status', protect, roleMiddleware('seller', 'admin'), updateOrderStatus);

export default router;
