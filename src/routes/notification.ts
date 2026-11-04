import { Router } from "express";
import {
  getMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../controllers/notificationController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

// @route   GET /api/notifications
// @desc    Get user notifications
router.get("/", protect, getMyNotifications);

// @route   PUT /api/notifications/:id/read
// @desc    Mark one notification as read
router.put("/:id/read", protect, markNotificationAsRead);

// @route   PUT /api/notifications/read-all
// @desc    Mark all user notifications as read
router.put("/read-all", protect, markAllNotificationsAsRead);

export default router;
