import { Response } from "express";
import { ObjectId } from "mongodb";
import { client } from "../db/db";
import { IOrder, IOrderItem, IShippingAddress } from "../models/Order";
import { IProduct } from "../models/Product";
import { IStockMovement } from "../models/StockMovement";
import { AuthenticatedRequest } from "../types/express";

const ordersCollection = client.db("AgroMart").collection<IOrder>("orders");
const productsCollection = client.db("AgroMart").collection<IProduct>("products");
const stockMovementsCollection = client.db("AgroMart").collection<IStockMovement>("stock_movements");

// Generate clean human-readable order number (e.g. ORD-384912)
const generateOrderNumber = (): string => {
  const timestamp = Date.now().toString().slice(-5);
  const random = Math.floor(100 + Math.random() * 900);
  return `ORD-${timestamp}${random}`;
};

// @route   POST /api/orders
// @desc    Create a new order for Farmer/Buyer (Cash on Delivery) with strict atomic inventory checks
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
      // Find and decrement stock ONLY IF quantity is sufficient
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

    // 4. Create Order Document
    const deliveryFee = 80;
    const totalAmount = subtotal + deliveryFee;

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

    const orderNumber = generateOrderNumber();
    const newOrder: IOrder = {
      orderNumber,
      userId,
      customerName: formattedAddress.name,
      customerPhone: formattedAddress.phone,
      items: formattedItems,
      subtotal,
      deliveryFee,
      totalAmount,
      shippingAddress: formattedAddress,
      paymentMethod: paymentMethod === "cod" ? "cod" : "cod",
      paymentStatus: "unpaid",
      status: "pending",
      createdAt: new Date(),
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
// @desc    Get all orders for the logged-in Farmer
// @access  Private
export const getMyOrders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawUserId = req.user?._id;
    if (!rawUserId) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const userId = new ObjectId(String(rawUserId));
    const orders = await ordersCollection
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json(orders);
  } catch (error) {
    console.error("Fetch Farmer Orders Error:", error);
    return res.status(500).json({ message: "অর্ডার তালিকা লোড করতে ব্যর্থ হয়েছে" });
  }
};

// @route   GET /api/orders/seller
// @desc    Get all orders containing seller's products
// @access  Private (Seller)
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

    // Find orders containing any of seller's products OR matching sellerId directly in item
    const orderQuery: any = {
      $or: [
        { "items.productId": { $in: sellerProductIds } },
        { "items.productId": { $in: sellerProductIdStrs } },
        { "items.sellerId": sellerIdStr },
        { "items.sellerId": sellerId },
      ],
    };

    const orders = await ordersCollection
      .find(orderQuery)
      .sort({ createdAt: -1 })
      .toArray();

    // Filter order items to only seller's items
    const sellerOrders = orders.map((order) => ({
      ...order,
      items: order.items.filter((item) =>
        sellerProductIds.some((id) => id?.equals && id.equals(item.productId)) ||
        sellerProductIdStrs.includes(String(item.productId)) ||
        String(item.sellerId) === sellerIdStr
      ),
    }));

    return res.status(200).json(sellerOrders);
  } catch (error) {
    console.error("Fetch Seller Orders Error:", error);
    return res.status(500).json({ message: "বিক্রেতার অর্ডার লোড করতে ব্যর্থ হয়েছে" });
  }
};

// @route   PUT /api/orders/seller/:orderId
// @desc    Update order status with automatic stock restoration on cancellation
// @access  Private (Seller or Admin)
export const updateOrderStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const orderIdStr = Array.isArray(req.params.orderId)
      ? req.params.orderId[0]
      : String(req.params.orderId || "");

    const { status } = req.body as {
      status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
    };

    if (
      !status ||
      !["pending", "confirmed", "shipped", "delivered", "cancelled"].includes(status)
    ) {
      return res.status(400).json({ message: "অবৈধ অর্ডার স্ট্যাটাস" });
    }

    if (!orderIdStr || !ObjectId.isValid(orderIdStr)) {
      return res.status(400).json({ message: "অবৈধ অর্ডার আইডি" });
    }

    const orderObjectId = new ObjectId(orderIdStr);
    const order = await ordersCollection.findOne({ _id: orderObjectId });

    if (!order) {
      return res.status(404).json({ message: "অর্ডারটি পাওয়া যায়নি" });
    }

    const previousStatus = order.status;

    // If order was already cancelled, do not restore stock again (Idempotent!)
    if (previousStatus === "cancelled" && status === "cancelled") {
      return res.status(200).json({
        success: true,
        message: "অর্ডারটি ইতিমধ্যে বাতিল অবস্থায় রয়েছে",
      });
    }

    // Update the order status
    await ordersCollection.updateOne(
      { _id: orderObjectId },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      }
    );

    // If status transitioned to 'cancelled', restore stock automatically
    if (status === "cancelled" && previousStatus !== "cancelled") {
      for (const item of order.items) {
        const product = await productsCollection.findOne({ _id: item.productId });
        const previousStock = Number(product?.quantity || 0);
        const restoredStock = previousStock + Number(item.quantity);

        await productsCollection.updateOne(
          { _id: item.productId },
          { $inc: { quantity: item.quantity }, $set: { updatedAt: new Date() } }
        );

        // Record stock movement
        const movement: IStockMovement = {
          productId: item.productId,
          productName: item.name,
          sellerId: item.sellerId || new ObjectId(String(user._id)),
          type: "order_cancelled",
          quantityChange: item.quantity,
          previousStock,
          newStock: restoredStock,
          orderId: order._id,
          orderNumber: order.orderNumber,
          reason: `অর্ডার বাতিল হওয়ায় স্টক পুনরুদ্ধার (${order.orderNumber || String(order._id)})`,
          performedBy: {
            userId: new ObjectId(String(user._id)),
            name: user.name || "বিক্রেতা",
            role: user.role === "admin" ? "admin" : "seller",
          },
          createdAt: new Date(),
        };

        await stockMovementsCollection.insertOne(movement);
      }
    }

    return res.status(200).json({
      success: true,
      message: `অর্ডার স্ট্যাটাস সফলভাবে '${status}'-এ আপডেট করা হয়েছে${
        status === "cancelled" ? " এবং সংশ্লিষ্ট পণ্যগুলির স্টক স্বয়ংক্রিয়ভাবে পুনরুদ্ধার হয়েছে" : ""
      }`,
    });
  } catch (error) {
    console.error("Update Order Status Error:", error);
    return res.status(500).json({ message: "স্ট্যাটাস আপডেট করতে সমস্যা হয়েছে" });
  }
};

// @route   PUT /api/orders/:orderId/cancel
// @desc    Customer self-cancellation for 'pending' orders with automatic stock restoration
// @access  Private (Order Owner)
export const cancelMyOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawUserId = req.user?._id;
    if (!rawUserId) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const orderIdStr = Array.isArray(req.params.orderId)
      ? req.params.orderId[0]
      : String(req.params.orderId || "");

    if (!orderIdStr || !ObjectId.isValid(orderIdStr)) {
      return res.status(400).json({ message: "অবৈধ অর্ডার আইডি" });
    }

    const orderObjectId = new ObjectId(orderIdStr);
    const order = await ordersCollection.findOne({ _id: orderObjectId });

    if (!order) {
      return res.status(404).json({ message: "অর্ডারটি পাওয়া যায়নি" });
    }

    // Verify ownership
    if (String(order.userId) !== String(rawUserId) && req.user?.role !== "admin") {
      return res.status(403).json({ message: "এই অর্ডারটি বাতিল করার অনুমতি আপনার নেই" });
    }

    if (order.status !== "pending") {
      return res.status(400).json({
        message: `শুধুমাত্র অপেক্ষমান (Pending) অর্ডার বাতিল করা সম্ভব। বর্তমান স্ট্যাটাস: ${order.status}`,
      });
    }

    // Set status to cancelled
    await ordersCollection.updateOne(
      { _id: orderObjectId },
      { $set: { status: "cancelled", updatedAt: new Date() } }
    );

    // Restore stock for all items
    for (const item of order.items) {
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
        sellerId: item.sellerId || order.userId,
        type: "order_cancelled",
        quantityChange: item.quantity,
        previousStock,
        newStock: restoredStock,
        orderId: order._id,
        orderNumber: order.orderNumber,
        reason: `গ্রাহক নিজে অর্ডার বাতিল করেছেন (${order.orderNumber || String(order._id)})`,
        performedBy: {
          userId: new ObjectId(String(rawUserId)),
          name: req.user?.name || "গ্রাহক",
          role: (req.user?.role as any) || "farmer",
        },
        createdAt: new Date(),
      };

      await stockMovementsCollection.insertOne(movement);
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
