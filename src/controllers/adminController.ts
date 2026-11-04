import { Response } from "express";
import { ObjectId } from "mongodb";
import { client } from "../db/db";
import { IUser } from "../models/User";
import { IProduct, ProductStatus } from "../models/Product";
import { IOrder } from "../models/Order";
import { AuthenticatedRequest } from "../types/express";
import { ensureOrderCompatibility } from "./orderController";

const usersCollection = client.db("AgroMart").collection<IUser>("users");
const productsCollection = client.db("AgroMart").collection<IProduct>("products");
const ordersCollection = client.db("AgroMart").collection<IOrder>("orders");

/**
 * @route   GET /api/admin/users
 * @desc    Get all users
 * @access  Private (Admin)
 */
export const getUsers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await usersCollection.find({}).toArray();
    return res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * @route   PATCH /api/admin/users/:id/role
 * @desc    Change a user's role (farmer, seller, admin)
 * @access  Private (Admin)
 */
export const updateUserRole = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { role } = req.body;

    if (!id || !ObjectId.isValid(id)) {
      return res.status(400).json({ message: "অবৈধ ব্যবহারকারী আইডি" });
    }

    const validRoles = ["farmer", "seller", "admin"];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ message: "অবৈধ ভূমিকা (Role)। গ্রহণযোগ্য রোল: farmer, seller, admin" });
    }

    const targetUserId = new ObjectId(id);

    // Prevent admin from removing their own admin status
    if (req.user?._id && String(req.user._id) === targetUserId.toString() && role !== "admin") {
      return res.status(400).json({ message: "আপনি নিজের অ্যাডমিন ভূমিকা পরিবর্তন করতে পারবেন না" });
    }

    const existingUser = await usersCollection.findOne({ _id: targetUserId });
    if (!existingUser) {
      return res.status(404).json({ message: "ব্যবহারকারী পাওয়া যায়নি" });
    }

    await usersCollection.updateOne(
      { _id: targetUserId },
      { $set: { role: role as "farmer" | "seller" | "admin", updatedAt: new Date() } }
    );

    const updatedUser = await usersCollection.findOne({ _id: targetUserId }, { projection: { password: 0 } });

    return res.status(200).json({
      success: true,
      message: "ব্যবহারকারীর ভূমিকা সফলভাবে আপডেট করা হয়েছে",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user role:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Remove/delete a user
 * @access  Private (Admin)
 */
export const deleteUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    if (!id || !ObjectId.isValid(id)) {
      return res.status(400).json({ message: "অবৈধ ব্যবহারকারী আইডি" });
    }

    const targetUserId = new ObjectId(id);

    // Prevent admin from deleting their own account
    if (req.user?._id && String(req.user._id) === targetUserId.toString()) {
      return res.status(400).json({ message: "আপনি নিজের অ্যাডমিন অ্যাকাউন্ট মুছে ফেলতে পারবেন না" });
    }

    const existingUser = await usersCollection.findOne({ _id: targetUserId });
    if (!existingUser) {
      return res.status(404).json({ message: "ব্যবহারকারী পাওয়া যায়নি" });
    }

    // Delete user from users collection
    await usersCollection.deleteOne({ _id: targetUserId });

    // Also delete any products associated with this user
    await productsCollection.deleteMany({
      $or: [{ sellerId: targetUserId }, { farmerId: targetUserId }],
    });

    return res.status(200).json({
      success: true,
      message: "ব্যবহারকারী অ্যাকাউন্ট সফলভাবে অপসারণ করা হয়েছে",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * @route   GET /api/admin/products
 * @desc    Get all products for admin management and review
 * @access  Private (Admin)
 */
export const getAdminProducts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, search } = req.query as { status?: string; search?: string };
    const query: any = {};

    if (status && status !== "all") {
      if (status === "approved") {
        query.$or = [{ status: "approved" }, { status: { $exists: false } }, { status: null }];
      } else {
        query.status = status;
      }
    }

    if (search && search.trim()) {
      query.name = { $regex: search.trim(), $options: "i" };
    }

    const products = await productsCollection
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .toArray();

    // Populate seller information
    const userIds = products
      .map((p) => p.sellerId || p.farmerId)
      .filter((id): id is ObjectId => Boolean(id));

    const sellers = await usersCollection
      .find({ _id: { $in: userIds } }, { projection: { name: 1, email: 1, phone: 1 } })
      .toArray();

    const sellerMap = new Map(sellers.map((s) => [String(s._id), s]));

    const populatedProducts = products.map((p) => {
      const sellerIdStr = String(p.sellerId || p.farmerId || "");
      const seller = sellerMap.get(sellerIdStr);
      return {
        ...p,
        status: p.status || "approved",
        seller: seller
          ? { _id: seller._id, name: seller.name, email: seller.email, phone: seller.phone }
          : undefined,
      };
    });

    return res.status(200).json({
      success: true,
      total: populatedProducts.length,
      products: populatedProducts,
    });
  } catch (error) {
    console.error("Error fetching admin products:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * @route   PATCH /api/admin/products/:id/status
 * @desc    Approve or reject a product
 * @access  Private (Admin)
 */
export const updateProductStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
    const { status } = req.body as { status: ProductStatus };

    if (!productId || !ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "অবৈধ পণ্য আইডি" });
    }

    const allowedStatuses: ProductStatus[] = ["pending", "approved", "rejected"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "অবৈধ স্ট্যাটাস। গ্রহণযোগ্য স্ট্যাটাস: pending, approved, rejected",
      });
    }

    const result = await productsCollection.findOneAndUpdate(
      { _id: new ObjectId(productId) },
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!result) {
      return res.status(404).json({ message: "পণ্যটি পাওয়া যায়নি" });
    }

    return res.status(200).json({
      success: true,
      message:
        status === "approved"
          ? "পণ্যটি সফলভাবে অনুমোদন করা হয়েছে"
          : status === "rejected"
          ? "পণ্যটি বাতিল করা হয়েছে"
          : "পণ্যটি অপেক্ষমান তালিকায় রাখা হয়েছে",
      product: result,
    });
  } catch (error) {
    console.error("Error updating product status:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * @route   GET /api/admin/stats
 * @desc    Get aggregated platform statistics & recent activities for Admin Dashboard
 * @access  Private (Admin)
 */
export const getAdminStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [
      totalUsers,
      farmersCount,
      sellersCount,
      adminsCount,
      totalProducts,
      approvedProducts,
      pendingProducts,
      rejectedProducts,
      totalOrders,
      pendingOrders,
      deliveredOrders,
      ordersRevenueAggregate,
      recentPendingProducts,
      recentOrders,
    ] = await Promise.all([
      usersCollection.countDocuments(),
      usersCollection.countDocuments({ role: "farmer" }),
      usersCollection.countDocuments({ role: "seller" }),
      usersCollection.countDocuments({ role: "admin" }),
      productsCollection.countDocuments(),
      productsCollection.countDocuments({
        $or: [{ status: "approved" }, { status: { $exists: false } }, { status: null as any }],
      }),
      productsCollection.countDocuments({ status: "pending" }),
      productsCollection.countDocuments({ status: "rejected" }),
      ordersCollection.countDocuments(),
      ordersCollection.countDocuments({ status: "pending" }),
      ordersCollection.countDocuments({ status: "delivered" }),
      ordersCollection
        .aggregate<{ totalRevenue: number }>([
          { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
        ])
        .toArray(),
      productsCollection
        .find({ status: "pending" })
        .sort({ createdAt: -1, _id: -1 })
        .limit(5)
        .toArray(),
      ordersCollection
        .find({})
        .sort({ createdAt: -1, _id: -1 })
        .limit(5)
        .toArray(),
    ]);

    // Populate sellers for recent pending products
    const sellerIds = recentPendingProducts
      .map((p) => p.sellerId || p.farmerId)
      .filter((id): id is ObjectId => Boolean(id));

    const sellers = await usersCollection
      .find({ _id: { $in: sellerIds } }, { projection: { name: 1, email: 1, phone: 1 } })
      .toArray();

    const sellerMap = new Map(sellers.map((s) => [String(s._id), s]));

    const populatedPending = recentPendingProducts.map((p) => {
      const sellerIdStr = String(p.sellerId || p.farmerId || "");
      const s = sellerMap.get(sellerIdStr);
      return {
        ...p,
        seller: s ? { _id: s._id, name: s.name, email: s.email, phone: s.phone } : undefined,
      };
    });

    const totalRevenue = ordersRevenueAggregate[0]?.totalRevenue || 0;

    return res.status(200).json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          farmers: farmersCount,
          sellers: sellersCount,
          admins: adminsCount,
        },
        products: {
          total: totalProducts,
          approved: approvedProducts,
          pending: pendingProducts,
          rejected: rejectedProducts,
        },
        orders: {
          total: totalOrders,
          pending: pendingOrders,
          delivered: deliveredOrders,
          revenue: totalRevenue,
        },
      },
      recentPendingProducts: populatedPending,
      recentOrders,
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * @route   GET /api/admin/orders
 * @desc    Get all orders across marketplace
 * @access  Private (Admin)
 */
export const getAdminOrders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, search } = req.query as { status?: string; search?: string };
    const query: any = {};

    if (status && status !== "all") {
      const upper = status.toUpperCase();
      const lower = status.toLowerCase();
      query.$or = [{ status: upper }, { status: lower }, { status }];
    }

    if (search && search.trim()) {
      const q = search.trim();
      const searchConditions = [
        { orderNumber: { $regex: q, $options: "i" } },
        { customerName: { $regex: q, $options: "i" } },
        { customerPhone: { $regex: q, $options: "i" } },
        { "shippingAddress.district": { $regex: q, $options: "i" } },
        { "shippingAddress.address": { $regex: q, $options: "i" } },
        { trackingNumber: { $regex: q, $options: "i" } },
        { courierName: { $regex: q, $options: "i" } },
        { "shipments.trackingNumber": { $regex: q, $options: "i" } },
        { "shipments.courierName": { $regex: q, $options: "i" } },
        { "shipments.sellerName": { $regex: q, $options: "i" } },
        { "items.name": { $regex: q, $options: "i" } },
      ];

      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchConditions }];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
    }

    const rawOrders = await ordersCollection
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .toArray();

    const orders = rawOrders.map(ensureOrderCompatibility);

    return res.status(200).json(orders);
  } catch (error) {
    console.error("Error fetching admin orders:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
