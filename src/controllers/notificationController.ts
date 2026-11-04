import { Response } from "express";
import { ObjectId } from "mongodb";
import { client } from "../db/db";
import { INotification, NotificationType } from "../models/Notification";
import { AuthenticatedRequest } from "../types/express";

const notificationsCollection = client.db("AgroMart").collection<INotification>("notifications");

/**
 * Reusable helper to send in-app notification to any user
 */
export const createNotification = async (params: {
  userId: ObjectId;
  title: string;
  message: string;
  type?: NotificationType;
  orderId?: ObjectId;
  orderNumber?: string;
  shipmentId?: string;
  link?: string;
}) => {
  try {
    const doc: INotification = {
      userId: params.userId,
      title: params.title,
      message: params.message,
      type: params.type || "order_status",
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      shipmentId: params.shipmentId,
      link: params.link,
      isRead: false,
      createdAt: new Date(),
    };
    await notificationsCollection.insertOne(doc);
  } catch (error) {
    console.error("Failed to insert notification:", error);
  }
};

/**
 * @route   GET /api/notifications
 * @desc    Get recent notifications for logged in user
 * @access  Private
 */
export const getMyNotifications = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawUserId = req.user?._id;
    if (!rawUserId) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const userId = new ObjectId(String(rawUserId));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));

    const notifications = await notificationsCollection
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const unreadCount = await notificationsCollection.countDocuments({
      userId,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      unreadCount,
      notifications,
    });
  } catch (error) {
    console.error("Fetch notifications error:", error);
    return res.status(500).json({ message: "নোটিফিকেশন লোড করতে সমস্যা হয়েছে" });
  }
};

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark a single notification as read
 * @access  Private
 */
export const markNotificationAsRead = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawUserId = req.user?._id;
    if (!rawUserId) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const notificationId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : String(req.params.id || "");

    if (!notificationId || !ObjectId.isValid(notificationId)) {
      return res.status(400).json({ message: "অবৈধ নোটিফিকেশন আইডি" });
    }

    const userId = new ObjectId(String(rawUserId));
    await notificationsCollection.updateOne(
      { _id: new ObjectId(notificationId), userId },
      { $set: { isRead: true } }
    );

    return res.status(200).json({ success: true, message: "পঠিত হিসেবে চিহ্নিত করা হয়েছে" });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({ message: "সার্ভার ত্রুটি হয়েছে" });
  }
};

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all unread notifications as read
 * @access  Private
 */
export const markAllNotificationsAsRead = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawUserId = req.user?._id;
    if (!rawUserId) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const userId = new ObjectId(String(rawUserId));
    await notificationsCollection.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true } }
    );

    return res.status(200).json({
      success: true,
      message: "সকল নোটিফিকেশন পঠিত হিসেবে চিহ্নিত করা হয়েছে",
    });
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    return res.status(500).json({ message: "সার্ভার ত্রুটি হয়েছে" });
  }
};
