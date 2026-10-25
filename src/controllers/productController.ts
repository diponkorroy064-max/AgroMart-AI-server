import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { client } from "../db/db";
import { IProduct, ProductStatus } from "../models/Product";
import { IStockMovement } from "../models/StockMovement";
import { AuthenticatedRequest } from "../types/express";

const productsCollection = client.db("AgroMart").collection<IProduct>("products");
const stockMovementsCollection = client.db("AgroMart").collection<IStockMovement>("stock_movements");
const categoriesCollection = client.db("AgroMart").collection("categories");

// ==========================================
// Reusable DRY Helper Functions
// ==========================================

/**
 * Safely parse string to MongoDB ObjectId
 */
export const toObjectId = (id?: string | ObjectId): ObjectId | null => {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
};

/**
 * Reusable ownership check for Seller / Admin operations
 */
export const verifyProductOwnership = async (
  productId: string | string[] | undefined,
  user?: AuthenticatedRequest["user"]
): Promise<{ status: number; message?: string; product?: IProduct }> => {
  if (!user?._id) {
    return { status: 401, message: "অনুগ্রহ করে প্রথমে লগইন করুন" };
  }

  const idStr = Array.isArray(productId) ? productId[0] : String(productId || "");
  const pObjectId = toObjectId(idStr);
  if (!pObjectId) {
    return { status: 400, message: "অবৈধ পণ্য আইডি ফরম্যাট" };
  }

  const product = await productsCollection.findOne({ _id: pObjectId });
  if (!product) {
    return { status: 404, message: "পণ্যটি খুঁজে পাওয়া যায়নি" };
  }

  const userIdStr = String(user._id);
  const isOwner =
    (product.farmerId && String(product.farmerId) === userIdStr) ||
    (product.sellerId && String(product.sellerId) === userIdStr);

  const isAdmin = user.role === "admin";

  if (!isOwner && !isAdmin) {
    return { status: 403, message: "এই পণ্যটিতে পরিবর্তন করার অনুমতি আপনার নেই" };
  }

  return { status: 200, product };
};

/**
 * Reusable product payload validator & parser
 */
export const parseProductPayload = (body: any, isUpdate = false) => {
  const {
    name,
    description,
    price,
    quantity,
    category,
    subcategory,
    categoryId,
    subcategoryId,
    image,
    lowStockThreshold,
    batchNumber,
    expiryDate,
    mfgDate,
    unit,
    warehouseLocation,
  } = body;

  if (!isUpdate) {
    if (!name || !description || price === undefined || quantity === undefined || !category) {
      return { error: "পণ্যের নাম, বিবরণ, মূল্য, পরিমাণ ও ক্যাটাগরি আবশ্যক" };
    }
  }

  const payload: Partial<IProduct> = {};

  if (name !== undefined) payload.name = String(name).trim();
  if (description !== undefined) payload.description = String(description).trim();
  if (category !== undefined) payload.category = String(category).trim();
  if (subcategory !== undefined) payload.subcategory = String(subcategory).trim();
  if (categoryId !== undefined) {
    const parsedCatId = toObjectId(categoryId);
    if (parsedCatId) payload.categoryId = parsedCatId;
  }
  if (subcategoryId !== undefined) {
    const parsedSubId = toObjectId(subcategoryId);
    if (parsedSubId) payload.subcategoryId = parsedSubId;
  }
  if (image !== undefined) payload.image = String(image).trim();
  if (unit !== undefined) payload.unit = String(unit).trim();
  if (batchNumber !== undefined) payload.batchNumber = String(batchNumber).trim();
  if (warehouseLocation !== undefined) payload.warehouseLocation = String(warehouseLocation).trim();

  if (expiryDate !== undefined) {
    payload.expiryDate = expiryDate ? new Date(expiryDate) : undefined;
  }
  if (mfgDate !== undefined) {
    payload.mfgDate = mfgDate ? new Date(mfgDate) : undefined;
  }

  if (lowStockThreshold !== undefined) {
    const parsedThreshold = Number(lowStockThreshold);
    if (!isNaN(parsedThreshold) && parsedThreshold >= 0) {
      payload.lowStockThreshold = parsedThreshold;
    }
  }

  if (price !== undefined) {
    const parsedPrice = Number(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return { error: "পণ্যের মূল্য ০ বা তদূর্ধ্ব সঠিক সংখ্যা হতে হবে" };
    }
    payload.price = parsedPrice;
  }

  if (quantity !== undefined) {
    const parsedQuantity = Number(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 0) {
      return { error: "পণ্যের পরিমাণ ০ বা তদূর্ধ্ব সঠিক সংখ্যা হতে হবে" };
    }
    payload.quantity = parsedQuantity;
  }

  return { payload };
};

// ==========================================
// Seller APIs
// ==========================================

/**
 * @route   POST /api/products
 * @desc    Add a new product by Seller / Farmer
 * @access  Private (Seller, Farmer, Admin)
 */
export const createProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = toObjectId(req.user?._id);
    if (!userId) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const { error, payload } = parseProductPayload(req.body);
    if (error || !payload) {
      return res.status(400).json({ message: error });
    }

    const initialStatus: ProductStatus = req.user?.role === "admin" ? "approved" : "pending";

    const newProduct: IProduct = {
      name: payload.name!,
      description: payload.description!,
      price: payload.price!,
      quantity: payload.quantity!,
      category: payload.category!,
      subcategory: payload.subcategory,
      categoryId: payload.categoryId,
      subcategoryId: payload.subcategoryId,
      image: payload.image || "",
      farmerId: userId,
      sellerId: userId,
      status: initialStatus,
      createdAt: new Date(),
      updatedAt: new Date(),
      // Inventory fields
      lowStockThreshold: payload.lowStockThreshold ?? 5,
      batchNumber: payload.batchNumber || `BATCH-${Date.now().toString().slice(-6)}`,
      expiryDate: payload.expiryDate,
      mfgDate: payload.mfgDate,
      unit: payload.unit || "কেজি",
      warehouseLocation: payload.warehouseLocation || "প্রধান গোডাউন",
      reservedStock: 0,
    };

    const result = await productsCollection.insertOne(newProduct);
    const createdProduct = await productsCollection.findOne({ _id: result.insertedId });

    // Record initial stock entry in audit log if quantity > 0
    if (newProduct.quantity > 0) {
      const initialMovement: IStockMovement = {
        productId: result.insertedId,
        productName: newProduct.name,
        sellerId: userId,
        type: "initial",
        quantityChange: newProduct.quantity,
        previousStock: 0,
        newStock: newProduct.quantity,
        batchNumber: newProduct.batchNumber,
        reason: "প্রাথমিক পণ্য তালিকাভুক্ত ও স্টক এন্ট্রি",
        performedBy: {
          userId,
          name: req.user?.name || "বিক্রেতা",
          role: req.user?.role === "admin" ? "admin" : "seller",
        },
        createdAt: new Date(),
      };
      await stockMovementsCollection.insertOne(initialMovement);
    }

    return res.status(201).json({
      success: true,
      message:
        initialStatus === "approved"
          ? "পণ্য সফলভাবে তৈরি ও সরাসরি লাইভ করা হয়েছে"
          : "পণ্যটি যোগ করা হয়েছে এবং অ্যাডমিনের অনুমোদনের অপেক্ষায় রয়েছে",
      product: createdProduct,
    });
  } catch (err) {
    console.error("Create Product Error:", err);
    return res.status(500).json({ message: "সার্ভারে ত্রুটি দেখা দিয়েছে" });
  }
};

/**
 * @route   PUT /api/products/:id
 * @desc    Update product by Seller
 * @access  Private (Product Owner or Admin)
 */
export const updateProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status: authStatus, message, product } = await verifyProductOwnership(
      req.params.id,
      req.user
    );

    if (authStatus !== 200 || !product?._id) {
      return res.status(authStatus).json({ message });
    }

    const { error, payload } = parseProductPayload(req.body, true);
    if (error || !payload) {
      return res.status(400).json({ message: error });
    }

    payload.updatedAt = new Date();

    await productsCollection.updateOne(
      { _id: product._id },
      { $set: payload }
    );

    const updated = await productsCollection.findOne({ _id: product._id });

    return res.status(200).json({
      success: true,
      message: "পণ্য সফলভাবে আপডেট করা হয়েছে",
      product: updated,
    });
  } catch (err) {
    console.error("Update Product Error:", err);
    return res.status(500).json({ message: "সার্ভারে ত্রুটি দেখা দিয়েছে" });
  }
};

/**
 * @route   DELETE /api/products/:id
 * @desc    Delete product by Seller
 * @access  Private (Product Owner or Admin)
 */
export const deleteProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status: authStatus, message, product } = await verifyProductOwnership(
      req.params.id,
      req.user
    );

    if (authStatus !== 200 || !product?._id) {
      return res.status(authStatus).json({ message });
    }

    await productsCollection.deleteOne({ _id: product._id });

    return res.status(200).json({
      success: true,
      message: "পণ্যটি সফলভাবে মুছে ফেলা হয়েছে",
    });
  } catch (err) {
    console.error("Delete Product Error:", err);
    return res.status(500).json({ message: "সার্ভারে ত্রুটি দেখা দিয়েছে" });
  }
};

/**
 * @route   GET /api/products/seller
 * @desc    Get all products for the authenticated seller (Supports ?status=approved|pending|rejected|all and search)
 * @access  Private (Seller, Farmer)
 */
export const getSellerProducts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = toObjectId(req.user?._id);
    if (!userId) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const userIdStr = String(userId);
    const { status, search } = req.query as { status?: string; search?: string };
    // Seller ownership filter (supports both ObjectId and String representations)
    const baseFilter: any = {
      $or: [
        { farmerId: userId },
        { sellerId: userId },
        { farmerId: userIdStr },
        { sellerId: userIdStr },
      ],
    };

    // Calculate quick counts for dashboard badges
    const allSellerProducts = await productsCollection.find(baseFilter).toArray();

    const counts = {
      total: allSellerProducts.length,
      approved: allSellerProducts.filter((p) => p.status === "approved" || !p.status).length,
      pending: allSellerProducts.filter((p) => p.status === "pending").length,
      rejected: allSellerProducts.filter((p) => p.status === "rejected").length,
    };

    // Specific query with status filter
    const queryFilter: any = { ...baseFilter };

    if (status && status !== "all") {
      if (status === "approved") {
        // Backwards compatible: existing products without status field are considered approved
        queryFilter.$and = [
          { $or: [{ status: "approved" }, { status: { $exists: false } }] },
        ];
      } else {
        queryFilter.status = status;
      }
    }

    if (search && search.trim()) {
      queryFilter.name = { $regex: search.trim(), $options: "i" };
    }

    const products = await productsCollection
      .find(queryFilter)
      .sort({ createdAt: -1, _id: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      counts,
      total: products.length,
      products,
    });
  } catch (err) {
    console.error("Get Seller Products Error:", err);
    return res.status(500).json({ message: "সার্ভারে ত্রুটি দেখা দিয়েছে" });
  }
};

/**
 * @route   GET /api/products/seller/approved
 * @desc    Direct shortcut endpoint to get only seller's admin-approved products
 * @access  Private (Seller, Farmer)
 */
export const getSellerApprovedProducts = async (req: AuthenticatedRequest, res: Response) => {
  req.query.status = "approved";
  return getSellerProducts(req, res);
};

// ==========================================
// Public & General APIs
// ==========================================

/**
 * @route   GET /api/products
 * @desc    Public listing of approved products with search, pagination, category & price filters
 * @access  Public
 */
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const {
      search,
      category,
      subcategory,
      categoryId,
      subcategoryId,
      sort,
      minPrice,
      maxPrice,
      page = "1",
      limit = "15",
    } = req.query as Record<string, string>;

    const query: any = {
      // Only approved products visible to public (or legacy products without status)
      $or: [{ status: "approved" }, { status: { $exists: false } }, { status: null }],
    };

    if (search && search.trim()) {
      query.name = { $regex: search.trim(), $options: "i" };
    }

    if (category && category !== "all" && category !== "All") {
      const cleanCat = category.trim();
      const lowerCat = cleanCat.toLowerCase();

      // Look up category in categoriesCollection by slug, _id, or name
      const catDoc = await categoriesCollection.findOne({
        $or: [
          { slug: lowerCat },
          { name: cleanCat },
          { name: { $regex: cleanCat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
          ...(ObjectId.isValid(cleanCat) ? [{ _id: new ObjectId(cleanCat) }] : []),
        ],
      });

      const orConditions: any[] = [
        { category: { $regex: new RegExp(`^${cleanCat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
        { category: { $regex: cleanCat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
      ];

      if (catDoc) {
        orConditions.push({ categoryId: catDoc._id });
        const docSlug = (catDoc.slug || "").toLowerCase();

        if (docSlug === "fertilizers") {
          orConditions.push({ category: { $regex: "fertilizer|urea|tsp|dap|potash|সার", $options: "i" } });
        } else if (docSlug === "seeds") {
          orConditions.push({ category: { $regex: "seed|ধান|বীজ", $options: "i" } });
        } else if (docSlug === "pesticides") {
          orConditions.push({ category: { $regex: "pesticide|crop protection|insecticide|fungicide|কীটনাশক|বালাইনাশক", $options: "i" } });
        } else if (docSlug === "herbicides") {
          orConditions.push({ category: { $regex: "herbicide|weed|আগাছানাশক", $options: "i" } });
        } else if (docSlug === "agricultural-machinery") {
          orConditions.push({ category: { $regex: "machinery|tiller|tractor|farm equipment|যন্ত্রপাতি", $options: "i" } });
        } else if (docSlug === "irrigation-equipment") {
          orConditions.push({ category: { $regex: "irrigation|pump|drip|sprinkler|সেচ|greenhouse", $options: "i" } });
        } else if (docSlug === "farming-tools") {
          orConditions.push({ category: { $regex: "tool|shears|sickle|spade|testing|সরঞ্জাম", $options: "i" } });
        }

        const engMatch = catDoc.name?.match(/\(([^)]+)\)/);
        if (engMatch && engMatch[1]) {
          orConditions.push({ category: { $regex: engMatch[1].trim(), $options: "i" } });
        }
      }

      query.$and = query.$and || [];
      query.$and.push({ $or: orConditions });
    }

    if (subcategory && subcategory !== "all" && subcategory !== "All") {
      query.subcategory = { $regex: new RegExp(`^${subcategory.trim()}$`, "i") };
    }

    if (categoryId) {
      const parsedCatId = toObjectId(categoryId);
      if (parsedCatId) {
        query.categoryId = parsedCatId;
      }
    }

    if (subcategoryId) {
      const parsedSubId = toObjectId(subcategoryId);
      if (parsedSubId) {
        query.subcategoryId = parsedSubId;
      }
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    let sortOption: any = { createdAt: -1, _id: -1 };
    switch (sort) {
      case "price-asc":
      case "low":
        sortOption = { price: 1 };
        break;
      case "price-desc":
      case "high":
        sortOption = { price: -1 };
        break;
      case "name":
        sortOption = { name: 1 };
        break;
      case "newest":
        sortOption = { createdAt: -1, _id: -1 };
        break;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 15);
    const skip = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      productsCollection.find(query).sort(sortOption).skip(skip).limit(limitNum).toArray(),
      productsCollection.countDocuments(query),
    ]);

    const now = new Date();
    const formattedProducts = products.map((p) => {
      const expDate = p.expiryDate ? new Date(p.expiryDate) : null;
      const isExpired = expDate ? expDate <= now : false;
      const availableStock = isExpired
        ? 0
        : Math.max(0, (p.quantity || 0) - (p.reservedStock || 0));
      return {
        ...p,
        availableStock,
        isExpired,
        unit: p.unit || "কেজি",
        lowStockThreshold: p.lowStockThreshold || 5,
      };
    });

    return res.json({
      success: true,
      products: formattedProducts,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      limit: limitNum,
    });
  } catch (error) {
    console.error("Get All Products Error:", error);
    return res.status(500).json({ message: "সার্ভার এরর" });
  }
};

/**
 * @route   GET /api/products/all
 * @desc    Quick public array of products
 * @access  Public
 */
export const getProducts = async (req: Request, res: Response) => {
  try {
    const products = await productsCollection
      .find({
        $or: [{ status: "approved" }, { status: { $exists: false } }],
      })
      .sort({ _id: -1 })
      .toArray();

    return res.status(200).json(products);
  } catch (err) {
    console.error("Get Products Error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

/**
 * @route   GET /api/products/:id
 * @desc    Get single product details with seller info
 * @access  Public
 */
export const getProductById = async (req: Request, res: Response) => {
  try {
    const idStr = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id || "");
    const pObjectId = toObjectId(idStr);
    if (!pObjectId) {
      return res.status(400).json({ message: "অবৈধ পণ্য আইডি" });
    }

    const product = await productsCollection.findOne({ _id: pObjectId });
    if (!product) {
      return res.status(404).json({ message: "পণ্যটি খুঁজে পাওয়া যায়নি" });
    }

    // Lookup seller info
    const sellerId = product.sellerId || product.farmerId;
    let sellerInfo: any = null;
    if (sellerId) {
      const seller = await client
        .db("AgroMart")
        .collection("users")
        .findOne({ _id: sellerId }, { projection: { name: 1, email: 1, phone: 1, address: 1 } });
      if (seller) {
        sellerInfo = {
          _id: seller._id,
          name: seller.name,
          phone: seller.phone,
          address: seller.address,
        };
      }
    }

    const now = new Date();
    const expDate = product.expiryDate ? new Date(product.expiryDate) : null;
    const isExpired = expDate ? expDate <= now : false;
    const availableStock = isExpired
      ? 0
      : Math.max(0, (product.quantity || 0) - (product.reservedStock || 0));

    return res.json({
      ...product,
      farmer: sellerInfo,
      seller: sellerInfo,
      availableStock,
      isExpired,
      unit: product.unit || "কেজি",
      lowStockThreshold: product.lowStockThreshold || 5,
    });
  } catch (err) {
    console.error("Get Product By ID Error:", err);
    return res.status(500).json({ message: "সার্ভারে ত্রুটি দেখা দিয়েছে" });
  }
};

/**
 * @route   POST /api/products/upload
 * @desc    Upload product image
 * @access  Private (Seller, Farmer, Admin)
 */
export const uploadImage = (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: "কোনো ছবি আপলোড করা হয়নি" });
  }
  return res.status(200).json({
    success: true,
    image: `/uploads/${req.file.filename}`,
  });
};
