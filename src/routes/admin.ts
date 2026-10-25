import { Router } from "express";
import {
  getUsers,
  updateUserRole,
  deleteUser,
  getAdminProducts,
  updateProductStatus,
  getAdminStats,
  getAdminOrders,
} from "../controllers/adminController";
import { protect } from "../middleware/authMiddleware";
import { roleMiddleware } from "../middleware/roleMiddleware";

const router = Router();

// Platform stats
router.get("/stats", protect, roleMiddleware("admin"), getAdminStats);

// Users management
router.get("/users", protect, roleMiddleware("admin"), getUsers);
router.patch("/users/:id/role", protect, roleMiddleware("admin"), updateUserRole);
router.delete("/users/:id", protect, roleMiddleware("admin"), deleteUser);

// Orders tracking
router.get("/orders", protect, roleMiddleware("admin"), getAdminOrders);

// Products management & approvals
router.get("/products", protect, roleMiddleware("admin"), getAdminProducts);
router.patch("/products/:id/status", protect, roleMiddleware("admin"), updateProductStatus);

export default router;
