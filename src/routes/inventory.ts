import { Router } from "express";
import {
  getInventory,
  adjustStock,
  updateInventorySettings,
  getStockMovements,
  getInventoryAlerts,
  getInventoryReport,
} from "../controllers/inventoryController";
import { protect } from "../middleware/authMiddleware";
import { roleMiddleware } from "../middleware/roleMiddleware";

const router = Router();

// All inventory routes require authentication and seller or admin role (or farmer creator)
const inventoryAuth = [protect, roleMiddleware("seller", "admin", "farmer")];

// @route   GET /api/inventory
// @desc    Get inventory list with summary KPIs, search, filters & pagination
router.get("/", inventoryAuth, getInventory);

// @route   POST /api/inventory/adjust
// @desc    Adjust product stock (+ / -) with reason & audit logging
router.post("/adjust", inventoryAuth, adjustStock);

// @route   PATCH /api/inventory/settings/:productId
// @desc    Update product inventory metadata (batch, expiry, threshold, unit, location)
router.patch("/settings/:productId", inventoryAuth, updateInventorySettings);

// @route   GET /api/inventory/movements
// @desc    Get stock movement audit history
router.get("/movements", inventoryAuth, getStockMovements);

// @route   GET /api/inventory/alerts
// @desc    Get urgent stock alerts (low stock, out of stock, expired, expiring soon)
router.get("/alerts", inventoryAuth, getInventoryAlerts);

// @route   GET /api/inventory/reports
// @desc    Get inventory valuation, category distribution & movement reports
router.get("/reports", inventoryAuth, getInventoryReport);

export default router;
