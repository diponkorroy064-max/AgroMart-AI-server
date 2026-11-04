import { Response } from "express";
import { ObjectId } from "mongodb";
import { client } from "../db/db";
import {
  IOrder,
  IOrderItem,
  IShippingAddress,
  OrderStatus,
  ISellerShipment,
  IOrderStatusHistory,
} from "../models/Order";
import { IProduct } from "../models/Product";
import { IStockMovement } from "../models/StockMovement";
import { IUser } from "../models/User";
import { AuthenticatedRequest } from "../types/express";
import { createNotification } from "./notificationController";

const ordersCollection = client.db("AgroMart").collection<IOrder>("orders");
const productsCollection = client.db("AgroMart").collection<IProduct>("products");
const stockMovementsCollection = client.db("AgroMart").collection<IStockMovement>("stock_movements");
const usersCollection = client.db("AgroMart").collection<IUser>("users");

// Human readable Bengali status labels for notifications
export const STATUS_LABELS_BN: Record<string, string> = {
  PENDING: "অর্ডার গৃহীত হয়েছে (অপেক্ষমান)",
  CONFIRMED: "অর্ডার নিশ্চিত করা হয়েছে",
  PROCESSING: "পণ্য প্রস্তুত করা হচ্ছে",
  PACKED: "শিপমেন্টের জন্য প্যাকেট সম্পন্ন",
  SHIPPED: "কুরিয়ারে হস্তান্তর করা হয়েছে (ইন ট্রানজিট)",
  OUT_FOR_DELIVERY: "ডেলিভারির জন্য বের হয়েছে",
  DELIVERED: "সফলভাবে ডেলিভারি সম্পন্ন হয়েছে",
  CANCELLED: "অর্ডার বাতিল করা হয়েছে",
  DELIVERY_FAILED: "ডেলিভারি ব্যর্থ হয়েছে",
  RETURN_REQUESTED: "পণ্য ফেরতের (Return) অনুরোধ করা হয়েছে",
  RETURNED: "পণ্য সফলভাবে ফেরত নেওয়া হয়েছে",
  // lowercase
  pending: "অর্ডার গৃহীত হয়েছে (অপেক্ষমান)",
  confirmed: "অর্ডার নিশ্চিত করা হয়েছে",
  processing: "পণ্য প্রস্তুত করা হচ্ছে",
  packed: "শিপমেন্টের জন্য প্যাকেট সম্পন্ন",
  shipped: "কুরিয়ারে হস্তান্তর করা হয়েছে (ইন ট্রানজিট)",
  out_for_delivery: "ডেলিভারির জন্য বের হয়েছে",
  delivered: "সফলভাবে ডেলিভারি সম্পন্ন হয়েছে",
  cancelled: "অর্ডার বাতিল করা হয়েছে",
  delivery_failed: "ডেলিভারি ব্যর্থ হয়েছে",
  return_requested: "পণ্য ফেরতের (Return) অনুরোধ করা হয়েছে",
  returned: "পণ্য সফলভাবে ফেরত নেওয়া হয়েছে",
};

/**
 * Normalizes any status to canonical uppercase
 */
export const normalizeStatus = (status?: string): OrderStatus => {
  if (!status) return "PENDING";
  const upper = status.toUpperCase();
  const validStatuses: OrderStatus[] = [
    "PENDING",
    "CONFIRMED",
    "PROCESSING",
    "PACKED",
    "SHIPPED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
    "DELIVERY_FAILED",
    "RETURN_REQUESTED",
    "RETURNED",
  ];
  if (validStatuses.includes(upper as OrderStatus)) {
    return upper as OrderStatus;
  }
  return "PENDING";
};

/**
 * Valid allowed state transitions
 */
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["OUT_FOR_DELIVERY", "DELIVERY_FAILED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERY_FAILED: ["OUT_FOR_DELIVERY", "CANCELLED", "RETURNED"],
  DELIVERED: ["RETURN_REQUESTED"],
  RETURN_REQUESTED: ["RETURNED", "DELIVERED"],
  CANCELLED: [],
  RETURNED: [],
  // lowercase keys
  pending: ["CONFIRMED", "CANCELLED"],
  confirmed: ["PROCESSING", "CANCELLED"],
  processing: ["PACKED", "CANCELLED"],
  packed: ["SHIPPED", "CANCELLED"],
  shipped: ["OUT_FOR_DELIVERY", "DELIVERY_FAILED"],
  out_for_delivery: ["DELIVERED", "DELIVERY_FAILED"],
  delivered: ["RETURN_REQUESTED"],
  delivery_failed: ["OUT_FOR_DELIVERY", "CANCELLED", "RETURNED"],
  return_requested: ["RETURNED", "DELIVERED"],
  cancelled: [],
  returned: [],
};

/**
 * Deterministically compute parent order overall status from seller shipments
 */
export const computeOverallOrderStatus = (shipments: ISellerShipment[]): OrderStatus => {
  if (!shipments || shipments.length === 0) return "PENDING";
  const statuses = shipments.map((s) => normalizeStatus(s.status));

  // If all are cancelled
  if (statuses.every((s) => s === "CANCELLED")) return "CANCELLED";

  // Consider non-cancelled shipments
  const active = statuses.filter((s) => s !== "CANCELLED");
  if (active.length === 0) return "CANCELLED";

  // If all active shipments are delivered
  if (active.every((s) => s === "DELIVERED")) return "DELIVERED";

  // If all active shipments are returned
  if (active.every((s) => s === "RETURNED")) return "RETURNED";

  // Priority hierarchy for ongoing state
  if (active.some((s) => s === "RETURN_REQUESTED")) return "RETURN_REQUESTED";
  if (active.some((s) => s === "DELIVERY_FAILED")) return "DELIVERY_FAILED";
  if (active.some((s) => s === "OUT_FOR_DELIVERY")) return "OUT_FOR_DELIVERY";
  if (active.some((s) => s === "SHIPPED")) return "SHIPPED";
  if (active.some((s) => s === "PACKED")) return "PACKED";
  if (active.some((s) => s === "PROCESSING")) return "PROCESSING";
  if (active.some((s) => s === "CONFIRMED")) return "CONFIRMED";

  return "PENDING";
};

// Generate clean human-readable order number (e.g. ORD-384912)
const generateOrderNumber = (): string => {
  const timestamp = Date.now().toString().slice(-5);
  const random = Math.floor(100 + Math.random() * 900);
  return `ORD-${timestamp}${random}`;
};

/**
 * Synthesize backward compatible shipments and status history if missing
 */
export const ensureOrderCompatibility = (order: IOrder): IOrder => {
  const normalized = normalizeStatus(order.status);
  let shipments = order.shipments;

  if (!shipments || shipments.length === 0) {
    // Group items by sellerId
    const sellerGroups = new Map<string, IOrderItem[]>();
    for (const item of order.items || []) {
      const sId = item.sellerId ? String(item.sellerId) : "general";
      if (!sellerGroups.has(sId)) {
        sellerGroups.set(sId, []);
      }
      sellerGroups.get(sId)!.push(item);
    }

    shipments = Array.from(sellerGroups.entries()).map(([sId, items], idx) => ({
      shipmentId: `SHP-${order.orderNumber || String(order._id).slice(-6)}-${idx + 1}`,
      sellerId: sId !== "general" && ObjectId.isValid(sId) ? new ObjectId(sId) : (order.userId as ObjectId),
      sellerName: "কৃষি বিক্রেতা",
      items,
      subtotal: items.reduce((sum, it) => sum + (it.price * it.quantity), 0),
      status: normalized,
      courierName: order.courierName,
      trackingNumber: order.trackingNumber,
      estimatedDeliveryDate: order.estimatedDeliveryDate,
      statusHistory: order.statusHistory || [
        {
          status: normalized,
          timestamp: order.createdAt || new Date(),
          note: "অর্ডার গৃহীত হয়েছে",
          updatedBy: {
            name: order.customerName || "সিস্টেম",
            role: "farmer",
          },
        },
      ],
      stockRestored: order.stockRestored || normalized === "CANCELLED" || normalized === "RETURNED",
      updatedAt: order.updatedAt || order.createdAt,
    }));
  }

  const statusHistory =
    order.statusHistory && order.statusHistory.length > 0
      ? order.statusHistory
      : [
          {
            status: normalized,
            timestamp: order.createdAt || new Date(),
            note: "অর্ডার গৃহীত হয়েছে",
            updatedBy: {
              name: order.customerName || "সিস্টেম",
              role: "farmer",
            },
          },
        ];

  return {
    ...order,
    status: normalized,
    shipments,
    statusHistory,
  };
};

// @route   POST /api/orders
// @desc    Create a new order for Farmer/Buyer (Cash on Delivery) with strict atomic inventory checks & multi-vendor shipment groups
// @access  Private
export const createOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawUserId = req.user?._id;
    if (!rawUserId) {
      return res.status(401).json({ message: "অর্ডার করতে অনুগ্রহ করে লগইন করুন" });
    }

    const userId = new ObjectId(String(rawUserId));
    const {
      items,
      shippingAddress,
      paymentMethod = "cod",
      note,
    } = req.body as {
      items: any[];
      shippingAddress: IShippingAddress;
      paymentMethod?: "cod" | "bkash" | "online";
      note?: string;
    };

    // 1. Validation
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "অর্ডারে কোনো পণ্য পাওয়া যায়নি" });
    }

    if (!shippingAddress || !shippingAddress.address || !shippingAddress.phone) {
      return res.status(400).json({
        message: "অনুগ্রহ করে ডেলিভারি ঠিকানা এবং সচল মোবাইল নম্বর প্রদান করুন",
      });
    }

    // 2. Pre-check items: existence, expiry, stock availability
    const now = new Date();
    const formattedItems: IOrderItem[] = [];
    let subtotal = 0;

    for (const item of items) {
      const pId = String(item.productId || item._id || "");
      if (!pId || !ObjectId.isValid(pId)) {
        return res.status(400).json({ message: `অবৈধ পণ্য আইডি: ${pId}` });
      }

      const productObjectId = new ObjectId(pId);
      const product = await productsCollection.findOne({ _id: productObjectId });

      if (!product) {
        return res.status(404).json({ message: `পণ্যটি পাওয়া যায়নি (ID: ${pId})` });
      }

      // Check if product is expired
      if (product.expiryDate && new Date(product.expiryDate) <= now) {
        return res.status(400).json({
          message: `"${product.name}" মেয়াদোত্তীর্ণ হয়ে গেছে। এই পণ্যটি ক্রয় করা সম্ভব নয়।`,
        });
      }

      const requestedQty = Math.max(1, Number(item.quantity ?? 1));
      const currentQty = Number(product.quantity || 0);

      // Check stock availability
      if (currentQty < requestedQty) {
        return res.status(400).json({
          message: `"${product.name}" এর পর্যাপ্ত স্টক নেই। বর্তমান অবশিষ্ট স্টক: ${currentQty} টি।`,
        });
      }

      const price = Number(product.price ?? item.price ?? 0);
      const name = String(product.name ?? item.name ?? "কৃষি পণ্য");
      const image = String(product.image ?? item.image ?? "");
      const sellerId = product.farmerId || product.sellerId;

      subtotal += price * requestedQty;

      formattedItems.push({
        productId: productObjectId,
        name,
        price,
        quantity: requestedQty,
        image,
        sellerId: sellerId ? new ObjectId(String(sellerId)) : undefined,
      });
    }

    // 3. Concurrency-safe atomic inventory deduction with automatic rollback on collision
    const successfulDeductions: {
      productId: ObjectId;
      quantity: number;
      productName: string;
      sellerId?: ObjectId;
      previousStock: number;
      newStock: number;
    }[] = [];

    for (const item of formattedItems) {
      const updatedProduct = await productsCollection.findOneAndUpdate(
        { _id: item.productId, quantity: { $gte: item.quantity } },
        { $inc: { quantity: -item.quantity } },
        { returnDocument: "after" }
      );

      if (!updatedProduct) {
        // Rollback any items that were already deducted in this transaction
        for (const done of successfulDeductions) {
          await productsCollection.updateOne(
            { _id: done.productId },
            { $inc: { quantity: done.quantity } }
          );
        }

        return res.status(409).json({
          message: `দুঃখিত, অন্য ক্রেতা একই সময়ে ক্রয় করায় "${item.name}" এর পর্যাপ্ত স্টক শেষ হয়ে গেছে। অনুগ্রহ করে আবার চেষ্টা করুন।`,
        });
      }

      const newStock = Number(updatedProduct.quantity || 0);
      const previousStock = newStock + item.quantity;

      successfulDeductions.push({
        productId: item.productId,
        quantity: item.quantity,
        productName: item.name,
        sellerId: item.sellerId,
        previousStock,
        newStock,
      });
    }

    // 4. Multi-Vendor Shipment Construction
    const orderNumber = generateOrderNumber();
    const deliveryFee = 80;
    const totalAmount = subtotal + deliveryFee;

    // Group items by seller
    const sellerItemsMap = new Map<string, IOrderItem[]>();
    for (const item of formattedItems) {
      const sKey = item.sellerId ? String(item.sellerId) : "unknown_seller";
      if (!sellerItemsMap.has(sKey)) {
        sellerItemsMap.set(sKey, []);
      }
      sellerItemsMap.get(sKey)!.push(item);
    }

    // Lookup seller names
    const sellerObjectIds = Array.from(sellerItemsMap.keys())
      .filter((k) => k !== "unknown_seller" && ObjectId.isValid(k))
      .map((k) => new ObjectId(k));

    const sellers = await usersCollection
      .find({ _id: { $in: sellerObjectIds } }, { projection: { name: 1 } })
      .toArray();

    const sellerNameMap = new Map(sellers.map((s) => [String(s._id), s.name || "কৃষি বিক্রেতা"]));

    const initialHistoryEntry: IOrderStatusHistory = {
      status: "PENDING",
      timestamp: new Date(),
      note: "অর্ডার সফলভাবে সম্পন্ন হয়েছে (ক্যাশ অন ডেলিভারি)",
      updatedBy: {
        userId,
        name: req.user?.name || "গ্রাহক",
        role: req.user?.role || "farmer",
      },
    };

    let shipmentCounter = 1;
    const shipments: ISellerShipment[] = [];

    for (const [sKey, sItems] of sellerItemsMap.entries()) {
      const shipmentId = `SHP-${orderNumber}-${shipmentCounter++}`;
      const sellerId =
        sKey !== "unknown_seller" && ObjectId.isValid(sKey) ? new ObjectId(sKey) : userId;
      const sellerName = sellerNameMap.get(sKey) || "কৃষি উদ্যোক্তা";
      const shipmentSubtotal = sItems.reduce((acc, i) => acc + i.price * i.quantity, 0);

      shipments.push({
        shipmentId,
        sellerId,
        sellerName,
        items: sItems,
        subtotal: shipmentSubtotal,
        status: "PENDING",
        statusHistory: [{ ...initialHistoryEntry, note: `${sellerName} এর জন্য অর্ডার অন্তর্ভুক্ত হয়েছে` }],
        stockRestored: false,
        updatedAt: new Date(),
      });
    }

    const formattedAddress: IShippingAddress = {
      name: shippingAddress.name || req.user?.name || "",
      phone: shippingAddress.phone,
      district: shippingAddress.district || "",
      address: shippingAddress.address,
      city: shippingAddress.city || shippingAddress.district || "",
      postalCode: shippingAddress.postalCode || "",
      country: shippingAddress.country || "Bangladesh",
      note: note || shippingAddress.note || "",
    };

    const newOrder: IOrder = {
      orderNumber,
      userId,
      customerName: formattedAddress.name,
      customerPhone: formattedAddress.phone,
      items: formattedItems,
      shipments,
      subtotal,
      deliveryFee,
      totalAmount,
      shippingAddress: formattedAddress,
      paymentMethod: paymentMethod === "cod" ? "cod" : "cod",
      paymentStatus: "unpaid",
      status: "PENDING",
      statusHistory: [initialHistoryEntry],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await ordersCollection.insertOne(newOrder);

    // 5. Record Stock Movement Audit Logs
    const movements: IStockMovement[] = successfulDeductions.map((d) => ({
      productId: d.productId,
      productName: d.productName,
      sellerId: d.sellerId || userId,
      type: "order_placed",
      quantityChange: -d.quantity,
      previousStock: d.previousStock,
      newStock: d.newStock,
      orderId: result.insertedId,
      orderNumber,
      reason: `অর্ডার তৈরি (${orderNumber})`,
      performedBy: {
        userId,
        name: req.user?.name || "গ্রাহক",
        role: (req.user?.role as any) || "farmer",
      },
      createdAt: new Date(),
    }));

    if (movements.length > 0) {
      await stockMovementsCollection.insertMany(movements);
    }

    // 6. In-App Notifications
    // Customer notification
    await createNotification({
      userId,
      title: "অর্ডার গ্রহণ করা হয়েছে",
      message: `আপনার অর্ডার #${orderNumber} সফলভাবে গৃহীত হয়েছে। মোট মূল্য: ৳${totalAmount}।`,
      type: "order_created",
      orderId: result.insertedId,
      orderNumber,
      link: `/dashboard/farmer/orders/${result.insertedId}`,
    });

    // Seller notifications
    for (const shipment of shipments) {
      if (shipment.sellerId && String(shipment.sellerId) !== String(userId)) {
        await createNotification({
          userId: shipment.sellerId,
          title: "নতুন অর্ডার পেয়েছেন!",
          message: `আপনার পণ্যের জন্য নতুন একটি অর্ডার এসেছে (#${orderNumber})। অনুগ্রহ করে অর্ডারটি কনফার্ম করুন।`,
          type: "order_created",
          orderId: result.insertedId,
          orderNumber,
          shipmentId: shipment.shipmentId,
          link: `/dashboard/seller/orders`,
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: "আপনার অর্ডারটি সফলভাবে গৃহীত হয়েছে (ক্যাশ অন ডেলিভারি)",
      orderId: result.insertedId,
      orderNumber: newOrder.orderNumber,
      order: {
        ...newOrder,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error("Create Order Error:", error);
    return res.status(500).json({ message: "অর্ডার সম্পন্ন করতে সার্ভার ত্রুটি হয়েছে" });
  }
};

// @route   GET /api/orders/my-orders
// @desc    Get all orders for the logged-in Farmer/Customer
// @access  Private
export const getMyOrders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawUserId = req.user?._id;
    if (!rawUserId) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const userId = new ObjectId(String(rawUserId));
    const rawOrders = await ordersCollection
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    const orders = rawOrders.map(ensureOrderCompatibility);

    return res.status(200).json(orders);
  } catch (error) {
    console.error("Fetch Farmer Orders Error:", error);
    return res.status(500).json({ message: "অর্ডার তালিকা লোড করতে ব্যর্থ হয়েছে" });
  }
};

// @route   GET /api/orders/:orderId
// @desc    Get detailed order information including tracking & multi-vendor shipments
// @access  Private (Owner, Seller with item in order, Admin)
export const getOrderDetails = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawUserId = req.user?._id;
    if (!rawUserId) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const orderIdStr = Array.isArray(req.params.orderId)
      ? req.params.orderId[0]
      : String(req.params.orderId || "");

    let query: any = {};
    if (ObjectId.isValid(orderIdStr)) {
      query = { $or: [{ _id: new ObjectId(orderIdStr) }, { orderNumber: orderIdStr }] };
    } else {
      query = { orderNumber: orderIdStr };
    }

    const rawOrder = await ordersCollection.findOne(query);
    if (!rawOrder) {
      return res.status(404).json({ message: "অর্ডারটি পাওয়া যায়নি" });
    }

    const order = ensureOrderCompatibility(rawOrder);
    const userRole = req.user?.role;
    const userIdStr = String(rawUserId);

    // Permission check
    const isOwner = String(order.userId) === userIdStr;
    const isAdmin = userRole === "admin";
    const isSeller =
      order.shipments?.some((s) => String(s.sellerId) === userIdStr) ||
      order.items?.some((i) => String(i.sellerId) === userIdStr);

    if (!isOwner && !isAdmin && !isSeller) {
      return res.status(403).json({ message: "এই অর্ডারের তথ্য দেখার অনুমতি আপনার নেই" });
    }

    // If seller (and not admin or owner), filter shipments/items for their view
    if (isSeller && !isAdmin && !isOwner) {
      const filteredShipments = order.shipments?.filter((s) => String(s.sellerId) === userIdStr) || [];
      const filteredItems = order.items?.filter((i) => String(i.sellerId) === userIdStr) || [];
      return res.status(200).json({
        ...order,
        shipments: filteredShipments,
        items: filteredItems,
      });
    }

    return res.status(200).json(order);
  } catch (error) {
    console.error("Get Order Details Error:", error);
    return res.status(500).json({ message: "অর্ডার তথ্য লোড করতে সমস্যা হয়েছে" });
  }
};

// @route   GET /api/orders/seller
// @desc    Get all orders containing seller's products
// @access  Private (Seller, Admin)
export const getSellerOrders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawSellerId = req.user?._id;
    if (!rawSellerId) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const sellerId = new ObjectId(String(rawSellerId));
    const sellerIdStr = String(sellerId);

    // Find all products of this seller
    const productQuery: any = {
      $or: [
        { farmerId: sellerId },
        { sellerId: sellerId },
        { farmerId: sellerIdStr },
        { sellerId: sellerIdStr },
      ],
    };

    const sellerProducts = await productsCollection
      .find(productQuery)
      .project({ _id: 1 })
      .toArray();

    const sellerProductIds = sellerProducts.map((p) => p._id);
    const sellerProductIdStrs = sellerProductIds.map((id) => String(id));

    // Find orders containing any of seller's products OR matching sellerId directly in item or shipment
    const orderQuery: any = {
      $or: [
        { "items.productId": { $in: sellerProductIds } },
        { "items.productId": { $in: sellerProductIdStrs } },
        { "items.sellerId": sellerIdStr },
        { "items.sellerId": sellerId },
        { "shipments.sellerId": sellerId },
        { "shipments.sellerId": sellerIdStr },
      ],
    };

    const rawOrders = await ordersCollection
      .find(orderQuery)
      .sort({ createdAt: -1 })
      .toArray();

    // Map and ensure compatibility, keeping only seller's relevant shipment/items
    const sellerOrders = rawOrders.map((rawOrder) => {
      const order = ensureOrderCompatibility(rawOrder);
      const myItems = order.items.filter(
        (item) =>
          sellerProductIds.some((id) => id?.equals && id.equals(item.productId)) ||
          sellerProductIdStrs.includes(String(item.productId)) ||
          String(item.sellerId) === sellerIdStr
      );
      const myShipments = order.shipments?.filter((s) => String(s.sellerId) === sellerIdStr) || [];

      // Determine seller's specific shipment status
      const sellerShipmentStatus =
        myShipments[0]?.status || order.status;

      return {
        ...order,
        items: myItems,
        shipments: myShipments,
        sellerShipment: myShipments[0] || null,
        status: sellerShipmentStatus, // Shows seller's own shipment status in seller table
        parentStatus: order.status,
      };
    });

    return res.status(200).json(sellerOrders);
  } catch (error) {
    console.error("Fetch Seller Orders Error:", error);
    return res.status(500).json({ message: "বিক্রেতার অর্ডার লোড করতে ব্যর্থ হয়েছে" });
  }
};

/**
 * Helper to idempotently restore stock for a list of items
 */
const restoreStockForItems = async (
  items: IOrderItem[],
  order: IOrder,
  reasonStr: string,
  performedBy: { userId: ObjectId; name: string; role: string }
) => {
  for (const item of items) {
    const product = await productsCollection.findOne({ _id: item.productId });
    const previousStock = Number(product?.quantity || 0);
    const restoredStock = previousStock + Number(item.quantity);

    await productsCollection.updateOne(
      { _id: item.productId },
      { $inc: { quantity: item.quantity }, $set: { updatedAt: new Date() } }
    );

    const movement: IStockMovement = {
      productId: item.productId,
      productName: item.name,
      sellerId: item.sellerId || performedBy.userId,
      type: "order_cancelled",
      quantityChange: item.quantity,
      previousStock,
      newStock: restoredStock,
      orderId: order._id,
      orderNumber: order.orderNumber,
      reason: reasonStr,
      performedBy: {
        userId: performedBy.userId,
        name: performedBy.name,
        role: (performedBy.role as any) || "seller",
      },
      createdAt: new Date(),
    };

    await stockMovementsCollection.insertOne(movement);
  }
};

// @route   PUT /api/orders/seller/:orderId
// @desc    Update order or shipment status by Seller or Admin with full validation & history
// @access  Private (Seller, Admin)
export const updateOrderStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const orderIdStr = Array.isArray(req.params.orderId)
      ? req.params.orderId[0]
      : String(req.params.orderId || "");

    const {
      status,
      shipmentId,
      courierName,
      trackingNumber,
      estimatedDeliveryDate,
      note,
    } = req.body as {
      status: string;
      shipmentId?: string;
      courierName?: string;
      trackingNumber?: string;
      estimatedDeliveryDate?: string | Date;
      note?: string;
    };

    if (!orderIdStr || !ObjectId.isValid(orderIdStr)) {
      return res.status(400).json({ message: "অবৈধ অর্ডার আইডি" });
    }

    const targetStatus = normalizeStatus(status);
    const orderObjectId = new ObjectId(orderIdStr);
    const rawOrder = await ordersCollection.findOne({ _id: orderObjectId });

    if (!rawOrder) {
      return res.status(404).json({ message: "অর্ডারটি পাওয়া যায়নি" });
    }

    const order = ensureOrderCompatibility(rawOrder);
    const isUserAdmin = user.role === "admin";
    const currentUserIdStr = String(user._id);

    // Identify target shipment if multi-vendor or seller update
    let targetShipmentIndex = -1;
    if (shipmentId && order.shipments) {
      targetShipmentIndex = order.shipments.findIndex((s) => s.shipmentId === shipmentId);
    } else if (order.shipments) {
      // Find shipment belonging to current seller
      targetShipmentIndex = order.shipments.findIndex((s) => String(s.sellerId) === currentUserIdStr);
    }

    // Seller authorization check: seller can only update their own shipment
    if (!isUserAdmin && targetShipmentIndex !== -1 && order.shipments) {
      const shp = order.shipments[targetShipmentIndex];
      if (String(shp.sellerId) !== currentUserIdStr) {
        return res.status(403).json({ message: "অন্য বিক্রেতার শিপমেন্ট আপডেট করার অনুমতি নেই" });
      }
    }

    const currentStatus =
      targetShipmentIndex !== -1 && order.shipments
        ? normalizeStatus(order.shipments[targetShipmentIndex].status)
        : normalizeStatus(order.status);

    // If same status, just update tracking / courier fields if provided
    if (currentStatus === targetStatus && !courierName && !trackingNumber && !estimatedDeliveryDate) {
      return res.status(200).json({
        success: true,
        message: `অর্ডারটি ইতিমধ্যে '${STATUS_LABELS_BN[targetStatus]}' অবস্থায় রয়েছে`,
      });
    }

    // Validate state transition (unless admin override)
    if (!isUserAdmin && currentStatus !== targetStatus) {
      const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(targetStatus)) {
        return res.status(400).json({
          message: `'${STATUS_LABELS_BN[currentStatus] || currentStatus}' থেকে '${STATUS_LABELS_BN[targetStatus] || targetStatus}' স্ট্যাটাসে পরিবর্তন করার অনুমতি নেই।`,
        });
      }
    }

    const now = new Date();
    const historyLog: IOrderStatusHistory = {
      status: targetStatus,
      timestamp: now,
      note: note || `${user.name || "বিক্রেতা"} স্ট্যাটাস পরিবর্তন করেছেন: ${STATUS_LABELS_BN[targetStatus]}`,
      courierName: courierName || order.courierName,
      trackingNumber: trackingNumber || order.trackingNumber,
      estimatedDeliveryDate: estimatedDeliveryDate || order.estimatedDeliveryDate,
      updatedBy: {
        userId: new ObjectId(String(user._id)),
        name: user.name || "বিক্রেতা",
        role: user.role || "seller",
      },
    };

    let updatedShipments = [...(order.shipments || [])];
    let shouldRestoreStock = false;
    let itemsToRestore: IOrderItem[] = [];

    if (targetShipmentIndex !== -1 && updatedShipments[targetShipmentIndex]) {
      const shp = updatedShipments[targetShipmentIndex];

      // Check stock restoration idempotency
      if (
        (targetStatus === "CANCELLED" || targetStatus === "RETURNED") &&
        !shp.stockRestored
      ) {
        shouldRestoreStock = true;
        itemsToRestore = shp.items;
        shp.stockRestored = true;
      }

      shp.status = targetStatus;
      if (courierName) shp.courierName = courierName;
      if (trackingNumber) shp.trackingNumber = trackingNumber;
      if (estimatedDeliveryDate) shp.estimatedDeliveryDate = estimatedDeliveryDate;
      shp.statusHistory = [...(shp.statusHistory || []), historyLog];
      shp.updatedAt = now;
      updatedShipments[targetShipmentIndex] = shp;
    } else {
      // Overall order level update
      if (
        (targetStatus === "CANCELLED" || targetStatus === "RETURNED") &&
        !order.stockRestored
      ) {
        shouldRestoreStock = true;
        itemsToRestore = order.items;
      }

      // Also cascade to shipments if updating overall order as Admin
      if (isUserAdmin && updatedShipments.length > 0) {
        updatedShipments = updatedShipments.map((s) => ({
          ...s,
          status: targetStatus,
          courierName: courierName || s.courierName,
          trackingNumber: trackingNumber || s.trackingNumber,
          estimatedDeliveryDate: estimatedDeliveryDate || s.estimatedDeliveryDate,
          statusHistory: [...(s.statusHistory || []), historyLog],
          stockRestored: targetStatus === "CANCELLED" || targetStatus === "RETURNED" ? true : s.stockRestored,
          updatedAt: now,
        }));
      }
    }

    // Recompute overall parent status
    const overallStatus = computeOverallOrderStatus(updatedShipments);

    const updateFields: any = {
      status: overallStatus,
      shipments: updatedShipments,
      updatedAt: now,
      statusHistory: [...(order.statusHistory || []), historyLog],
    };

    if (courierName) updateFields.courierName = courierName;
    if (trackingNumber) updateFields.trackingNumber = trackingNumber;
    if (estimatedDeliveryDate) updateFields.estimatedDeliveryDate = estimatedDeliveryDate;
    if (targetStatus === "CANCELLED" || targetStatus === "RETURNED") {
      updateFields.stockRestored = true;
    }

    await ordersCollection.updateOne({ _id: orderObjectId }, { $set: updateFields });

    // Execute stock restoration if required
    if (shouldRestoreStock && itemsToRestore.length > 0) {
      await restoreStockForItems(
        itemsToRestore,
        order,
        `স্ট্যাটাস '${STATUS_LABELS_BN[targetStatus]}' হওয়ায় স্টক পুনরুদ্ধার (${order.orderNumber})`,
        {
          userId: new ObjectId(String(user._id)),
          name: user.name || "বিক্রেতা",
          role: user.role || "seller",
        }
      );
    }

    // Send In-App notification to customer
    await createNotification({
      userId: order.userId,
      title: `অর্ডারের নতুন স্ট্যাটাস: ${STATUS_LABELS_BN[targetStatus]}`,
      message: `আপনার #${order.orderNumber} অর্ডারের স্ট্যাটাস '${STATUS_LABELS_BN[targetStatus]}'-এ পরিবর্তিত হয়েছে।${
        courierName ? ` (কুরিয়ার: ${courierName}${trackingNumber ? `, ট্র্যাকিং: ${trackingNumber}` : ""})` : ""
      }`,
      type: "order_status",
      orderId: order._id,
      orderNumber: order.orderNumber,
      link: `/dashboard/farmer/orders/${order._id}`,
    });

    return res.status(200).json({
      success: true,
      message: `স্ট্যাটাস সফলভাবে '${STATUS_LABELS_BN[targetStatus]}'-এ আপডেট করা হয়েছে${
        shouldRestoreStock ? " এবং পণ্যগুলির স্টক পুনরুদ্ধার করা হয়েছে" : ""
      }`,
      status: targetStatus,
      overallStatus,
    });
  } catch (error) {
    console.error("Update Order Status Error:", error);
    return res.status(500).json({ message: "স্ট্যাটাস আপডেট করতে সমস্যা হয়েছে" });
  }
};

// @route   PUT /api/orders/:orderId/cancel
// @desc    Customer self-cancellation for 'PENDING' / 'CONFIRMED' orders with automatic idempotent stock restoration
// @access  Private (Order Owner or Admin)
export const cancelMyOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawUserId = req.user?._id;
    if (!rawUserId) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const orderIdStr = Array.isArray(req.params.orderId)
      ? req.params.orderId[0]
      : String(req.params.orderId || "");

    const { reason } = req.body as { reason?: string };

    if (!orderIdStr || !ObjectId.isValid(orderIdStr)) {
      return res.status(400).json({ message: "অবৈধ অর্ডার আইডি" });
    }

    const orderObjectId = new ObjectId(orderIdStr);
    const rawOrder = await ordersCollection.findOne({ _id: orderObjectId });

    if (!rawOrder) {
      return res.status(404).json({ message: "অর্ডারটি পাওয়া যায়নি" });
    }

    const order = ensureOrderCompatibility(rawOrder);

    // Verify ownership
    if (String(order.userId) !== String(rawUserId) && req.user?.role !== "admin") {
      return res.status(403).json({ message: "এই অর্ডারটি বাতিল করার অনুমতি আপনার নেই" });
    }

    const currentStatus = normalizeStatus(order.status);
    if (currentStatus !== "PENDING" && currentStatus !== "CONFIRMED") {
      return res.status(400).json({
        message: `শুধুমাত্র 'অপেক্ষমান' বা 'নিশ্চিত' অবস্থার অর্ডার বাতিল করা সম্ভব। বর্তমান স্ট্যাটাস: ${STATUS_LABELS_BN[currentStatus]}`,
      });
    }

    const cancellationReason = reason || "গ্রাহক কর্তৃক অর্ডার বাতিল করা হয়েছে";
    const now = new Date();

    const historyEntry: IOrderStatusHistory = {
      status: "CANCELLED",
      timestamp: now,
      note: cancellationReason,
      updatedBy: {
        userId: new ObjectId(String(rawUserId)),
        name: req.user?.name || "গ্রাহক",
        role: req.user?.role || "farmer",
      },
    };

    // Update all shipments
    const updatedShipments = (order.shipments || []).map((s) => ({
      ...s,
      status: "CANCELLED" as OrderStatus,
      cancellationReason,
      stockRestored: true,
      statusHistory: [...(s.statusHistory || []), historyEntry],
      updatedAt: now,
    }));

    await ordersCollection.updateOne(
      { _id: orderObjectId },
      {
        $set: {
          status: "CANCELLED",
          shipments: updatedShipments,
          cancellationReason,
          stockRestored: true,
          statusHistory: [...(order.statusHistory || []), historyEntry],
          updatedAt: now,
        },
      }
    );

    // Restore stock if not already restored
    if (!order.stockRestored) {
      await restoreStockForItems(
        order.items,
        order,
        `গ্রাহক নিজে অর্ডার বাতিল করেছেন (${order.orderNumber}): ${cancellationReason}`,
        {
          userId: new ObjectId(String(rawUserId)),
          name: req.user?.name || "গ্রাহক",
          role: req.user?.role || "farmer",
        }
      );
    }

    // Notify customer
    await createNotification({
      userId: order.userId,
      title: "অর্ডার বাতিল সম্পন্ন",
      message: `আপনার অর্ডার #${order.orderNumber} সফলভাবে বাতিল করা হয়েছে।`,
      type: "order_cancelled",
      orderId: order._id,
      orderNumber: order.orderNumber,
      link: `/dashboard/farmer/orders/${order._id}`,
    });

    // Notify sellers
    for (const shp of updatedShipments) {
      if (shp.sellerId && String(shp.sellerId) !== String(rawUserId)) {
        await createNotification({
          userId: shp.sellerId,
          title: "অর্ডার বাতিল হয়েছে",
          message: `অর্ডার #${order.orderNumber} গ্রাহক কর্তৃক বাতিল করা হয়েছে এবং স্টক পুনরায় যুক্ত হয়েছে।`,
          type: "order_cancelled",
          orderId: order._id,
          orderNumber: order.orderNumber,
          shipmentId: shp.shipmentId,
          link: `/dashboard/seller/orders`,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "আপনার অর্ডারটি সফলভাবে বাতিল করা হয়েছে এবং স্টক পুনরুদ্ধার হয়েছে।",
    });
  } catch (error) {
    console.error("Cancel Order Error:", error);
    return res.status(500).json({ message: "অর্ডার বাতিল করতে সমস্যা হয়েছে" });
  }
};

// @route   POST /api/orders/:orderId/return
// @desc    Customer requests return on a delivered order
// @access  Private (Order Owner)
export const requestOrderReturn = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawUserId = req.user?._id;
    if (!rawUserId) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const orderIdStr = Array.isArray(req.params.orderId)
      ? req.params.orderId[0]
      : String(req.params.orderId || "");

    const { reason, shipmentId } = req.body as { reason: string; shipmentId?: string };

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: "পণ্য ফেরতের কারণ উল্লেখ করা আবশ্যক" });
    }

    if (!orderIdStr || !ObjectId.isValid(orderIdStr)) {
      return res.status(400).json({ message: "অবৈধ অর্ডার আইডি" });
    }

    const orderObjectId = new ObjectId(orderIdStr);
    const rawOrder = await ordersCollection.findOne({ _id: orderObjectId });

    if (!rawOrder) {
      return res.status(404).json({ message: "অর্ডারটি পাওয়া যায়নি" });
    }

    const order = ensureOrderCompatibility(rawOrder);

    // Verify ownership
    if (String(order.userId) !== String(rawUserId) && req.user?.role !== "admin") {
      return res.status(403).json({ message: "এই অর্ডারের জন্য রিটার্ন অনুরোধ করার অনুমতি আপনার নেই" });
    }

    const currentStatus = normalizeStatus(order.status);
    if (currentStatus !== "DELIVERED") {
      return res.status(400).json({
        message: `শুধুমাত্র ডেলিভারি সম্পন্ন অর্ডারের ক্ষেত্রেই রিটার্ন অনুরোধ করা যায়। বর্তমান অবস্থা: ${STATUS_LABELS_BN[currentStatus]}`,
      });
    }

    const now = new Date();
    const returnReason = reason.trim();
    const historyEntry: IOrderStatusHistory = {
      status: "RETURN_REQUESTED",
      timestamp: now,
      note: `রিটার্ন অনুরোধ: ${returnReason}`,
      updatedBy: {
        userId: new ObjectId(String(rawUserId)),
        name: req.user?.name || "গ্রাহক",
        role: "farmer",
      },
    };

    let updatedShipments = [...(order.shipments || [])];
    if (shipmentId) {
      updatedShipments = updatedShipments.map((s) => {
        if (s.shipmentId === shipmentId) {
          return {
            ...s,
            status: "RETURN_REQUESTED" as OrderStatus,
            returnReason,
            statusHistory: [...(s.statusHistory || []), historyEntry],
            updatedAt: now,
          };
        }
        return s;
      });
    } else {
      updatedShipments = updatedShipments.map((s) => ({
        ...s,
        status: "RETURN_REQUESTED" as OrderStatus,
        returnReason,
        statusHistory: [...(s.statusHistory || []), historyEntry],
        updatedAt: now,
      }));
    }

    await ordersCollection.updateOne(
      { _id: orderObjectId },
      {
        $set: {
          status: "RETURN_REQUESTED",
          shipments: updatedShipments,
          returnReason,
          statusHistory: [...(order.statusHistory || []), historyEntry],
          updatedAt: now,
        },
      }
    );

    // Notify sellers
    for (const shp of updatedShipments) {
      if (shp.sellerId) {
        await createNotification({
          userId: shp.sellerId,
          title: "পণ্য ফেরতের অনুরোধ এসেছে",
          message: `অর্ডার #${order.orderNumber} এর জন্য গ্রাহক পণ্য ফেরতের অনুরোধ করেছেন। কারণ: "${returnReason}"`,
          type: "return_requested",
          orderId: order._id,
          orderNumber: order.orderNumber,
          shipmentId: shp.shipmentId,
          link: `/dashboard/seller/orders`,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "আপনার রিটার্ন অনুরোধটি সফলভাবে গৃহীত হয়েছে। বিক্রেতা বিষয়টি পর্যালোচনা করবেন।",
    });
  } catch (error) {
    console.error("Return Request Error:", error);
    return res.status(500).json({ message: "রিটার্ন অনুরোধ করতে ব্যর্থ হয়েছে" });
  }
};

// @route   GET /api/orders/stats/summary
// @desc    Get order status summary statistics for Admin / Seller
// @access  Private
export const getOrderStatusStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawUserId = req.user?._id;
    if (!rawUserId) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const role = req.user?.role;
    let matchQuery: any = {};

    if (role === "seller") {
      const sellerId = new ObjectId(String(rawUserId));
      const sellerIdStr = String(sellerId);
      matchQuery = {
        $or: [
          { "items.sellerId": sellerId },
          { "items.sellerId": sellerIdStr },
          { "shipments.sellerId": sellerId },
          { "shipments.sellerId": sellerIdStr },
        ],
      };
    } else if (role !== "admin") {
      // Customer
      matchQuery = { userId: new ObjectId(String(rawUserId)) };
    }

    const orders = await ordersCollection.find(matchQuery).toArray();

    const counts: Record<string, number> = {
      TOTAL: orders.length,
      PENDING: 0,
      CONFIRMED: 0,
      PROCESSING: 0,
      PACKED: 0,
      SHIPPED: 0,
      OUT_FOR_DELIVERY: 0,
      DELIVERED: 0,
      CANCELLED: 0,
      DELIVERY_FAILED: 0,
      RETURN_REQUESTED: 0,
      RETURNED: 0,
    };

    let totalAmount = 0;

    for (const ord of orders) {
      const normalized = normalizeStatus(ord.status);
      counts[normalized] = (counts[normalized] || 0) + 1;
      totalAmount += ord.totalAmount || 0;
    }

    return res.status(200).json({
      success: true,
      counts,
      totalAmount,
    });
  } catch (error) {
    console.error("Fetch Order Stats Error:", error);
    return res.status(500).json({ message: "পরিসংখ্যান লোড করতে সমস্যা হয়েছে" });
  }
};
