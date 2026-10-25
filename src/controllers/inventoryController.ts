import { Response } from "express";
import { ObjectId } from "mongodb";
import { client } from "../db/db";
import { IProduct } from "../models/Product";
import { IStockMovement, StockMovementType } from "../models/StockMovement";
import { IUser } from "../models/User";
import { AuthenticatedRequest } from "../types/express";

const productsCollection = client.db("AgroMart").collection<IProduct>("products");
const usersCollection = client.db("AgroMart").collection<IUser>("users");
const stockMovementsCollection = client.db("AgroMart").collection<IStockMovement>("stock_movements");

/**
 * Helper to safely convert id to ObjectId
 */
const toObjectId = (id?: string | ObjectId): ObjectId | null => {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
};

/**
 * Reusable helper to verify product ownership for inventory operations
 */
const verifyInventoryAccess = async (
  productId: string,
  user?: AuthenticatedRequest["user"]
): Promise<{ status: number; message?: string; product?: IProduct }> => {
  if (!user?._id) {
    return { status: 401, message: "অনুগ্রহ করে লগইন করুন" };
  }

  const pObjectId = toObjectId(productId);
  if (!pObjectId) {
    return { status: 400, message: "অবৈধ পণ্য আইডি" };
  }

  const product = await productsCollection.findOne({ _id: pObjectId });
  if (!product) {
    return { status: 404, message: "পণ্যটি খুঁজে পাওয়া যায়নি" };
  }

  const userIdStr = String(user._id);
  const isOwner =
    (product.farmerId && String(product.farmerId) === userIdStr) ||
    (product.sellerId && String(product.sellerId) === userIdStr);

  const isAdmin = user.role === "admin";

  if (!isOwner && !isAdmin) {
    return { status: 403, message: "এই পণ্যের ইনভেন্টরি পরিবর্তনের অনুমতি আপনার নেই" };
  }

  return { status: 200, product };
};

/**
 * @route   GET /api/inventory
 * @desc    Get inventory items with summary, filters, search, sorting & pagination
 * @access  Private (Seller: own products, Admin: all or seller-filtered)
 */
export const getInventory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const {
      search,
      category,
      status, // 'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'expiring_soon' | 'expired'
      sort = "newest", // 'newest' | 'stock_asc' | 'stock_desc' | 'price_asc' | 'price_desc' | 'expiry_asc'
      page = "1",
      limit = "10",
      sellerId: querySellerId,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));

    // Base filter by role
    let baseFilter: any = {};
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (user.role === "admin") {
      if (querySellerId && ObjectId.isValid(querySellerId)) {
        const targetSeller = new ObjectId(querySellerId);
        const targetStr = String(querySellerId);
        baseFilter.$or = [
          { farmerId: targetSeller },
          { sellerId: targetSeller },
          { farmerId: targetStr },
          { sellerId: targetStr },
        ];
      }
    } else {
      // Seller or Farmer: strictly limited to their own products
      const selfId = toObjectId(user._id)!;
      const selfStr = String(user._id);
      baseFilter.$or = [
        { farmerId: selfId },
        { sellerId: selfId },
        { farmerId: selfStr },
        { sellerId: selfStr },
      ];
    }

    // Retrieve all products within base scope to calculate accurate summary KPIs
    const allScopedProducts = await productsCollection.find(baseFilter).toArray();

    let totalStockUnits = 0;
    let totalStockValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let expiredCount = 0;
    let expiringSoonCount = 0;

    for (const p of allScopedProducts) {
      const qty = Number(p.quantity || 0);
      const price = Number(p.price || 0);
      const threshold = Number(p.lowStockThreshold || 5);
      const expDate = p.expiryDate ? new Date(p.expiryDate) : null;

      totalStockUnits += qty;
      totalStockValue += qty * price;

      if (qty <= 0) {
        outOfStockCount++;
      } else if (qty <= threshold) {
        lowStockCount++;
      }

      if (expDate) {
        if (expDate <= now) {
          expiredCount++;
        } else if (expDate <= in30Days) {
          expiringSoonCount++;
        }
      }
    }

    const summary = {
      totalProducts: allScopedProducts.length,
      totalStockUnits,
      totalStockValue,
      lowStockCount,
      outOfStockCount,
      expiredCount,
      expiringSoonCount,
    };

    // Build specific query for filtered/paged view
    const query: any = { ...baseFilter };

    // Search filter: product name, batchNumber, warehouseLocation
    if (search && search.trim()) {
      const s = search.trim();
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { name: { $regex: s, $options: "i" } },
          { batchNumber: { $regex: s, $options: "i" } },
          { warehouseLocation: { $regex: s, $options: "i" } },
          { category: { $regex: s, $options: "i" } },
        ],
      });
    }

    // Category filter
    if (category && category !== "All" && category !== "সকল ক্যাটাগরি") {
      query.category = { $regex: new RegExp(`^${category}$`, "i") };
    }

    // Status filter
    if (status && status !== "all") {
      query.$and = query.$and || [];
      if (status === "out_of_stock") {
        query.$and.push({ quantity: { $lte: 0 } });
      } else if (status === "low_stock") {
        query.$and.push({
          quantity: { $gt: 0, $lte: 5 }, // default threshold or handled in post-filter if custom
        });
      } else if (status === "in_stock") {
        query.$and.push({ quantity: { $gt: 5 } });
      } else if (status === "expired") {
        query.$and.push({ expiryDate: { $lte: now } });
      } else if (status === "expiring_soon") {
        query.$and.push({ expiryDate: { $gt: now, $lte: in30Days } });
      }
    }

    // Sorting
    let sortOptions: any = { createdAt: -1, _id: -1 };
    if (sort === "stock_asc") sortOptions = { quantity: 1 };
    else if (sort === "stock_desc") sortOptions = { quantity: -1 };
    else if (sort === "price_asc") sortOptions = { price: 1 };
    else if (sort === "price_desc") sortOptions = { price: -1 };
    else if (sort === "expiry_asc") sortOptions = { expiryDate: 1 };
    else if (sort === "name") sortOptions = { name: 1 };

    const totalFiltered = await productsCollection.countDocuments(query);
    const totalPages = Math.ceil(totalFiltered / limitNum) || 1;

    const rawProducts = await productsCollection
      .find(query)
      .sort(sortOptions)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .toArray();

    // Collect seller IDs to populate seller info for Admin
    const sellerIds = rawProducts
      .map((p) => p.sellerId || p.farmerId)
      .filter((id): id is ObjectId => Boolean(id) && id instanceof ObjectId);

    const sellers = sellerIds.length > 0
      ? await usersCollection.find({ _id: { $in: sellerIds } }).project({ name: 1, email: 1, phone: 1 }).toArray()
      : [];
    const sellerMap = new Map<string, { _id: string; name: string; email: string; phone?: string }>();
    sellers.forEach((s) => sellerMap.set(String(s._id), { _id: String(s._id), name: s.name, email: s.email, phone: s.phone }));

    // Enhance each item with computed inventory states
    const items = rawProducts.map((p) => {
      const qty = Number(p.quantity || 0);
      const reserved = Number(p.reservedStock || 0);
      const availableStock = Math.max(0, qty - reserved);
      const threshold = Number(p.lowStockThreshold || 5);
      const expDate = p.expiryDate ? new Date(p.expiryDate) : null;
      const isExpired = expDate ? expDate <= now : false;
      const isExpiringSoon = expDate ? expDate > now && expDate <= in30Days : false;

      let stockStatus: "in_stock" | "low_stock" | "out_of_stock" = "in_stock";
      if (qty <= 0) stockStatus = "out_of_stock";
      else if (qty <= threshold) stockStatus = "low_stock";

      const sellerKey = String(p.sellerId || p.farmerId || "");
      const sellerInfo = sellerMap.get(sellerKey);

      return {
        ...p,
        _id: String(p._id),
        availableStock,
        reservedStock: reserved,
        lowStockThreshold: threshold,
        unit: p.unit || "কেজি",
        batchNumber: p.batchNumber || "N/A",
        warehouseLocation: p.warehouseLocation || "প্রধান গোডাউন",
        stockStatus,
        isExpired,
        isExpiringSoon,
        seller: sellerInfo,
      };
    });

    return res.status(200).json({
      success: true,
      summary,
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalFiltered,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Get Inventory Error:", error);
    return res.status(500).json({ message: "ইনভেন্টরি ডেটা লোড করতে ব্যর্থ হয়েছে" });
  }
};

/**
 * @route   POST /api/inventory/adjust
 * @desc    Adjust product stock (restock, write-off damage, manual adjustment, expired)
 * @access  Private (Seller for own product, Admin for any)
 */
export const adjustStock = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const {
      productId,
      type, // 'restock' | 'adjustment' | 'damaged' | 'expired'
      quantityChange,
      reason,
      batchNumber,
      expiryDate,
      warehouseLocation,
    } = req.body as {
      productId: string;
      type: StockMovementType;
      quantityChange: number | string;
      reason?: string;
      batchNumber?: string;
      expiryDate?: string;
      warehouseLocation?: string;
    };

    if (!productId) {
      return res.status(400).json({ message: "পণ্যের আইডি আবশ্যক" });
    }

    const validTypes: StockMovementType[] = ["restock", "adjustment", "damaged", "expired"];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ message: "অবৈধ স্টক অ্যাডজাস্টমেন্ট টাইপ" });
    }

    const parsedChange = Number(quantityChange);
    if (isNaN(parsedChange) || parsedChange === 0) {
      return res.status(400).json({ message: "স্টক পরিবর্তনের পরিমাণ শূন্য ব্যতীত সঠিক সংখ্যা হতে হবে" });
    }

    // Role & Ownership check
    const { status, message, product } = await verifyInventoryAccess(productId, user);
    if (status !== 200 || !product?._id) {
      return res.status(status).json({ message });
    }

    const previousStock = Number(product.quantity || 0);
    let delta = parsedChange;

    // For damage or expired, quantity is subtracted
    if ((type === "damaged" || type === "expired") && delta > 0) {
      delta = -delta;
    }

    const newStock = previousStock + delta;
    if (newStock < 0) {
      return res.status(400).json({
        message: `স্টক শূন্যের নিচে নামানো সম্ভব নয়। বর্তমান মজুদ: ${previousStock}`,
      });
    }

    // Build update payload
    const updatePayload: any = {
      quantity: newStock,
      updatedAt: new Date(),
    };

    if (batchNumber && batchNumber.trim()) {
      updatePayload.batchNumber = batchNumber.trim();
    }
    if (expiryDate) {
      updatePayload.expiryDate = new Date(expiryDate);
    }
    if (warehouseLocation && warehouseLocation.trim()) {
      updatePayload.warehouseLocation = warehouseLocation.trim();
    }

    // Atomic update
    await productsCollection.updateOne({ _id: product._id }, { $set: updatePayload });

    // Record Stock Movement Audit Log
    const movement: IStockMovement = {
      productId: product._id,
      productName: product.name,
      sellerId: product.farmerId || product.sellerId || new ObjectId(String(user._id)),
      type,
      quantityChange: delta,
      previousStock,
      newStock,
      batchNumber: batchNumber || product.batchNumber,
      reason: reason || `${type === "restock" ? "নতুন স্টক যোগ" : type === "damaged" ? "ক্ষতিগ্রস্থ স্টক বাদ" : type === "expired" ? "মেয়াদোত্তীর্ণ স্টক বাতিল" : "স্টক সমন্বয়"}`,
      performedBy: {
        userId: new ObjectId(String(user._id)),
        name: user.name || "ব্যবহারকারী",
        role: user.role === "admin" ? "admin" : "seller",
      },
      createdAt: new Date(),
    };

    await stockMovementsCollection.insertOne(movement);

    const updatedProduct = await productsCollection.findOne({ _id: product._id });

    return res.status(200).json({
      success: true,
      message: "স্টক সফলভাবে সমন্বয় করা হয়েছে",
      product: updatedProduct,
      movement,
    });
  } catch (error) {
    console.error("Adjust Stock Error:", error);
    return res.status(500).json({ message: "স্টক সমন্বয় করতে ব্যর্থ হয়েছে" });
  }
};

/**
 * @route   PATCH /api/inventory/settings/:productId
 * @desc    Update inventory metadata (batch number, expiry date, low stock threshold, unit, warehouse location)
 * @access  Private (Seller for own product, Admin for any)
 */
export const updateInventorySettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const productIdStr = Array.isArray(req.params.productId)
      ? req.params.productId[0]
      : String(req.params.productId || "");

    const { status, message, product } = await verifyInventoryAccess(productIdStr, user);
    if (status !== 200 || !product?._id) {
      return res.status(status).json({ message });
    }

    const {
      lowStockThreshold,
      batchNumber,
      expiryDate,
      mfgDate,
      unit,
      warehouseLocation,
    } = req.body;

    const updatePayload: any = {
      updatedAt: new Date(),
    };

    if (lowStockThreshold !== undefined) {
      const parsedThreshold = Number(lowStockThreshold);
      if (isNaN(parsedThreshold) || parsedThreshold < 0) {
        return res.status(400).json({ message: "স্বল্প স্টক থ্রেশহোল্ড ০ বা তদূর্ধ্ব সংখ্যা হতে হবে" });
      }
      updatePayload.lowStockThreshold = parsedThreshold;
    }

    if (batchNumber !== undefined) updatePayload.batchNumber = String(batchNumber).trim();
    if (unit !== undefined) updatePayload.unit = String(unit).trim();
    if (warehouseLocation !== undefined) updatePayload.warehouseLocation = String(warehouseLocation).trim();

    if (expiryDate !== undefined) {
      updatePayload.expiryDate = expiryDate ? new Date(expiryDate) : null;
    }
    if (mfgDate !== undefined) {
      updatePayload.mfgDate = mfgDate ? new Date(mfgDate) : null;
    }

    await productsCollection.updateOne({ _id: product._id }, { $set: updatePayload });
    const updated = await productsCollection.findOne({ _id: product._id });

    return res.status(200).json({
      success: true,
      message: "ইনভেন্টরি সেটিংস সফলভাবে আপডেট করা হয়েছে",
      product: updated,
    });
  } catch (error) {
    console.error("Update Inventory Settings Error:", error);
    return res.status(500).json({ message: "সেটিংস আপডেট করতে ব্যর্থ হয়েছে" });
  }
};

/**
 * @route   GET /api/inventory/movements
 * @desc    Get stock movement audit logs with filters & pagination
 * @access  Private (Seller sees own product movements, Admin sees all)
 */
export const getStockMovements = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const {
      productId,
      type,
      page = "1",
      limit = "15",
      sellerId: querySellerId,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));

    const query: any = {};

    // Role-based scope
    if (user.role === "admin") {
      if (querySellerId && ObjectId.isValid(querySellerId)) {
        query.sellerId = new ObjectId(querySellerId);
      }
    } else {
      const selfId = toObjectId(user._id)!;
      query.$or = [{ sellerId: selfId }, { sellerId: String(user._id) }];
    }

    if (productId && ObjectId.isValid(productId)) {
      query.productId = new ObjectId(productId);
    }

    if (type && type !== "all") {
      query.type = type;
    }

    const total = await stockMovementsCollection.countDocuments(query);
    const totalPages = Math.ceil(total / limitNum) || 1;

    const movements = await stockMovementsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .toArray();

    return res.status(200).json({
      success: true,
      movements,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Get Stock Movements Error:", error);
    return res.status(500).json({ message: "স্টক মুভমেন্ট হিস্ট্রি লোড করতে ব্যর্থ হয়েছে" });
  }
};

/**
 * @route   GET /api/inventory/alerts
 * @desc    Get urgent stock alerts (out of stock, low stock, expired, expiring soon)
 * @access  Private (Seller for own products, Admin for all)
 */
export const getInventoryAlerts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    let baseFilter: any = {};
    if (user.role !== "admin") {
      const selfId = toObjectId(user._id)!;
      const selfStr = String(user._id);
      baseFilter.$or = [
        { farmerId: selfId },
        { sellerId: selfId },
        { farmerId: selfStr },
        { sellerId: selfStr },
      ];
    }

    const products = await productsCollection.find(baseFilter).toArray();

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const outOfStockItems: any[] = [];
    const lowStockItems: any[] = [];
    const expiredItems: any[] = [];
    const expiringSoonItems: any[] = [];

    for (const p of products) {
      const qty = Number(p.quantity || 0);
      const threshold = Number(p.lowStockThreshold || 5);
      const expDate = p.expiryDate ? new Date(p.expiryDate) : null;

      const itemData = {
        _id: String(p._id),
        name: p.name,
        category: p.category,
        quantity: qty,
        unit: p.unit || "কেজি",
        lowStockThreshold: threshold,
        batchNumber: p.batchNumber,
        expiryDate: p.expiryDate,
        warehouseLocation: p.warehouseLocation,
      };

      if (qty <= 0) {
        outOfStockItems.push({
          ...itemData,
          severity: "critical",
          message: "পণ্যটির স্টক সম্পূর্ণরূপে শেষ হয়ে গেছে। অবিলম্বে রিস্টক করুন।",
        });
      } else if (qty <= threshold) {
        lowStockItems.push({
          ...itemData,
          severity: "warning",
          message: `স্টক সতর্কতা: মাত্র ${qty} ${itemData.unit} অবশিষ্ট রয়েছে (থ্রেশহোল্ড: ${threshold})।`,
        });
      }

      if (expDate) {
        if (expDate <= now) {
          expiredItems.push({
            ...itemData,
            severity: "critical",
            message: `মেয়াদ উত্তীর্ণ হয়েছে: ${expDate.toLocaleDateString("bn-BD")}। বিক্রয় বন্ধ করুন।`,
          });
        } else if (expDate <= in30Days) {
          const daysLeft = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          expiringSoonItems.push({
            ...itemData,
            severity: "warning",
            daysLeft,
            message: `মেয়াদ আসন্ন: আর মাত্র ${daysLeft} দিন বাকি আছে (${expDate.toLocaleDateString("bn-BD")})।`,
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      counts: {
        outOfStock: outOfStockItems.length,
        lowStock: lowStockItems.length,
        expired: expiredItems.length,
        expiringSoon: expiringSoonItems.length,
        totalAlerts:
          outOfStockItems.length + lowStockItems.length + expiredItems.length + expiringSoonItems.length,
      },
      outOfStockItems,
      lowStockItems,
      expiredItems,
      expiringSoonItems,
    });
  } catch (error) {
    console.error("Get Inventory Alerts Error:", error);
    return res.status(500).json({ message: "অ্যালার্ট লোড করতে ব্যর্থ হয়েছে" });
  }
};

/**
 * @route   GET /api/inventory/reports
 * @desc    Get aggregate inventory report (valuation, category distribution, movement breakdown)
 * @access  Private (Seller / Admin)
 */
export const getInventoryReport = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    let baseFilter: any = {};
    if (user.role !== "admin") {
      const selfId = toObjectId(user._id)!;
      const selfStr = String(user._id);
      baseFilter.$or = [
        { farmerId: selfId },
        { sellerId: selfId },
        { farmerId: selfStr },
        { sellerId: selfStr },
      ];
    }

    const products = await productsCollection.find(baseFilter).toArray();

    // 1. Category breakdown
    const categoryMap = new Map<string, { count: number; units: number; valuation: number }>();
    let grandValuation = 0;
    let grandUnits = 0;

    for (const p of products) {
      const cat = p.category || "অন্যান্য";
      const qty = Number(p.quantity || 0);
      const val = qty * Number(p.price || 0);

      grandValuation += val;
      grandUnits += qty;

      const current = categoryMap.get(cat) || { count: 0, units: 0, valuation: 0 };
      categoryMap.set(cat, {
        count: current.count + 1,
        units: current.units + qty,
        valuation: current.valuation + val,
      });
    }

    const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, stats]) => ({
      category,
      productCount: stats.count,
      totalUnits: stats.units,
      valuation: stats.valuation,
      valuationSharePercentage: grandValuation > 0 ? ((stats.valuation / grandValuation) * 100).toFixed(1) : "0",
    }));

    // 2. Movement Type Summary in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const movementFilter: any = { createdAt: { $gte: thirtyDaysAgo } };
    if (user.role !== "admin") {
      const selfId = toObjectId(user._id)!;
      movementFilter.$or = [{ sellerId: selfId }, { sellerId: String(user._id) }];
    }

    const movements = await stockMovementsCollection.find(movementFilter).toArray();
    const movementSummary = {
      restockedUnits: movements.filter((m) => m.type === "restock").reduce((sum, m) => sum + Math.abs(m.quantityChange), 0),
      soldUnits: movements.filter((m) => m.type === "order_placed").reduce((sum, m) => sum + Math.abs(m.quantityChange), 0),
      returnedUnits: movements.filter((m) => m.type === "order_cancelled").reduce((sum, m) => sum + Math.abs(m.quantityChange), 0),
      damagedUnits: movements.filter((m) => m.type === "damaged" || m.type === "expired").reduce((sum, m) => sum + Math.abs(m.quantityChange), 0),
    };

    return res.status(200).json({
      success: true,
      reportDate: new Date(),
      totalProducts: products.length,
      grandUnits,
      grandValuation,
      categoryBreakdown,
      movementSummary,
    });
  } catch (error) {
    console.error("Get Inventory Report Error:", error);
    return res.status(500).json({ message: "রিপোর্ট তৈরি করতে ব্যর্থ হয়েছে" });
  }
};
