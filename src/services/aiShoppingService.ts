import { ObjectId } from "mongodb";
import { client } from "../db/db";
import { IProduct } from "../models/Product";
import { IOrder } from "../models/Order";
import { IUser } from "../models/User";

const productsCollection = client.db("AgroMart").collection<IProduct>("products");
const categoriesCollection = client.db("AgroMart").collection("categories");
const ordersCollection = client.db("AgroMart").collection<IOrder>("orders");
const usersCollection = client.db("AgroMart").collection<IUser>("users");

export interface AIShoppingProduct {
  _id: string;
  name: string;
  description: string;
  price: number;
  quantity: number;
  availableStock: number;
  category: string;
  subcategory?: string;
  image?: string;
  unit?: string;
  sellerName?: string;
  warehouseLocation?: string;
  inStock: boolean;
}

export interface ProductComparisonItem {
  id: string;
  name: string;
  category: string;
  price: number;
  unit: string;
  description: string;
  stock: number;
  stockStatus: string;
  seller: string;
  image?: string;
}

export interface AIShoppingResponse {
  reply: string;
  action: "search" | "compare" | "recommend" | "cart_add_confirm" | "cart_view" | "order_tracking" | "general";
  products?: AIShoppingProduct[];
  comparison?: {
    title: string;
    items: ProductComparisonItem[];
  };
  cartAction?: {
    type: "add" | "view";
    product?: AIShoppingProduct;
    quantity?: number;
    totalPrice?: number;
    cartSummary?: string;
  };
  orderInfo?: {
    orderNumber: string;
    status: string;
    statusLabel: string;
    totalAmount: number;
    itemsCount: number;
    createdAt: string;
    courierName?: string;
    trackingNumber?: string;
    estimatedDeliveryDate?: string;
    orderId: string;
  };
  userOrders?: Array<{
    orderId: string;
    orderNumber: string;
    status: string;
    statusLabel: string;
    totalAmount: number;
    itemsCount: number;
    createdAt: string;
  }>;
  suggestions: string[];
  safetyWarning?: string;
  provider: "gemini" | "builtin-agrimart-engine";
}

// Agricultural safety advice template
const AGRI_SAFETY_DISCLAIMER_BN =
  "⚠️ কৃষি রাসায়নিক ও সার ব্যবহারের ক্ষেত্রে মোড়কের নির্দেশিত সঠিক মাত্রা মেনে চলুন। জটিল রোগ বা বালাই দমনে স্থানীয় উপসহকারী কৃষি কর্মকর্তার (SAAO) সরাসরি পরামর্শ গ্রহণ করুন।";

// Bengali status labels
const STATUS_LABELS: Record<string, string> = {
  PENDING: "অপেক্ষমান",
  CONFIRMED: "নিশ্চিত হয়েছে",
  PROCESSING: "প্রস্তুত করা হচ্ছে",
  PACKED: "প্যাকেজিং সম্পন্ন",
  SHIPPED: "ডেলিভারির পথে (In Transit)",
  OUT_FOR_DELIVERY: "ডেলিভারির জন্য বের হয়েছে",
  DELIVERED: "ডেলিভারি সম্পন্ন",
  CANCELLED: "বাতিলকৃত",
  RETURN_REQUESTED: "ফেরত অনুরোধকৃত",
  RETURNED: "ফেরত সম্পন্ন",
};

/**
 * Helper to fetch seller names for products in batch
 */
async function attachSellerNames(products: IProduct[]): Promise<AIShoppingProduct[]> {
  const sellerIds = new Set<string>();
  products.forEach((p) => {
    const sId = p.sellerId || p.farmerId;
    if (sId) sellerIds.add(String(sId));
  });

  const validObjectIds = Array.from(sellerIds)
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));

  const sellers = validObjectIds.length > 0
    ? await usersCollection.find({ _id: { $in: validObjectIds } }).toArray()
    : [];

  const sellerMap = new Map<string, string>();
  sellers.forEach((s) => {
    if (s._id) sellerMap.set(String(s._id), s.name || "বিশ্বস্ত বিক্রেতা");
  });

  return products.map((p) => {
    const sId = p.sellerId || p.farmerId;
    const sellerName = sId ? sellerMap.get(String(sId)) || "এগ্রো ডিলার" : "এগ্রো ডিলার";
    const available = Math.max(0, (p.quantity || 0) - (p.reservedStock || 0));

    return {
      _id: String(p._id),
      name: p.name,
      description: p.description || "",
      price: p.price,
      quantity: p.quantity,
      availableStock: available,
      category: p.category,
      subcategory: p.subcategory,
      image: p.image || "/placeholder-product.png",
      unit: p.unit || "প্যাকেট",
      sellerName,
      warehouseLocation: p.warehouseLocation,
      inStock: available > 0,
    };
  });
}

// ==========================================
// REAL DATABASE TOOLS
// ==========================================

export async function searchProductsTool(params: {
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  limit?: number;
}): Promise<AIShoppingProduct[]> {
  const {
    query,
    category,
    minPrice,
    maxPrice,
    inStockOnly = true,
    limit = 6,
  } = params;

  const mongoQuery: any = {
    $or: [{ status: "approved" }, { status: { $exists: false } }, { status: null }],
  };

  if (inStockOnly) {
    mongoQuery.quantity = { $gt: 0 };
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    mongoQuery.price = {};
    if (minPrice !== undefined) mongoQuery.price.$gte = Number(minPrice);
    if (maxPrice !== undefined) mongoQuery.price.$lte = Number(maxPrice);
  }

  const andClauses: any[] = [];

  if (query && query.trim()) {
    const cleanQuery = query.trim();
    // Match against name, description, category
    andClauses.push({
      $or: [
        { name: { $regex: cleanQuery, $options: "i" } },
        { description: { $regex: cleanQuery, $options: "i" } },
        { category: { $regex: cleanQuery, $options: "i" } },
      ],
    });
  }

  if (category && category !== "all" && category.trim()) {
    const cleanCat = category.trim();
    andClauses.push({
      $or: [
        { category: { $regex: cleanCat, $options: "i" } },
        { subcategory: { $regex: cleanCat, $options: "i" } },
      ],
    });
  }

  if (andClauses.length > 0) {
    mongoQuery.$and = andClauses;
  }

  const rawProducts = await productsCollection
    .find(mongoQuery)
    .sort({ quantity: -1, _id: -1 })
    .limit(Math.min(limit, 12))
    .toArray();

  return attachSellerNames(rawProducts);
}

export async function getProductDetailsTool(idOrName: string): Promise<AIShoppingProduct | null> {
  let query: any = {};
  if (ObjectId.isValid(idOrName)) {
    query = { _id: new ObjectId(idOrName) };
  } else {
    query = { name: { $regex: idOrName.trim(), $options: "i" } };
  }

  const product = await productsCollection.findOne(query);
  if (!product) return null;

  const [attached] = await attachSellerNames([product]);
  return attached || null;
}

export async function compareProductsTool(identifiers: string[]): Promise<ProductComparisonItem[]> {
  const items: ProductComparisonItem[] = [];

  for (const idOrName of identifiers) {
    if (!idOrName || !idOrName.trim()) continue;
    const p = await getProductDetailsTool(idOrName);
    if (p) {
      items.push({
        id: p._id,
        name: p.name,
        category: p.category || "তথ্য উপলব্ধ নয়",
        price: p.price,
        unit: p.unit || "প্যাকেট",
        description: p.description || "তথ্য উপলব্ধ নয়",
        stock: p.availableStock,
        stockStatus: p.inStock ? `স্টকে আছে (${p.availableStock} ${p.unit || "টি"})` : "স্টক শেষ",
        seller: p.sellerName || "তথ্য উপলব্ধ নয়",
        image: p.image,
      });
    }
  }

  return items;
}

export async function getOrderTrackingTool(
  orderNumberOrId: string,
  userId?: string
): Promise<IOrder | null> {
  if (!userId || !ObjectId.isValid(userId)) return null;

  const clean = orderNumberOrId.trim();
  const query: any = {
    userId: new ObjectId(userId),
  };

  if (ObjectId.isValid(clean)) {
    query.$or = [{ _id: new ObjectId(clean) }, { orderNumber: clean }];
  } else {
    query.orderNumber = clean;
  }

  return ordersCollection.findOne(query);
}

export async function getUserOrdersTool(userId: string, limit = 5): Promise<IOrder[]> {
  if (!userId || !ObjectId.isValid(userId)) return [];

  const query: any = {
    userId: new ObjectId(userId),
  };

  return ordersCollection
    .find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray();
}

// ==========================================
// INTENT PARSER & BUILT-IN AGRI ENGINE
// ==========================================

interface ParsedIntent {
  intent: "search" | "compare" | "recommend" | "cart_add" | "cart_view" | "track_order" | "my_orders" | "safety_info" | "greeting" | "help";
  queryText?: string;
  category?: string;
  crop?: string;
  minPrice?: number;
  maxPrice?: number;
  productNamesToCompare?: string[];
  orderIdentifier?: string;
  targetProduct?: string;
  quantity?: number;
}

function parseUserIntent(message: string): ParsedIntent {
  const lower = message.toLowerCase();
  const trimmed = message.trim();

  // 1. Order Tracking Intent
  const orderRegex = /(?:ord-|#ord-|অর্ডার নং|অর্ডার নম্বর|ট্র্যাক|track|order|কুরিয়ার|পার্সেল)\s*([a-zA-Z0-9-]+)?/i;
  const ordMatch = lower.match(orderRegex);
  const explicitOrdMatch = message.match(/(ORD-\d{5,10}|[0-9a-fA-F]{24})/);

  if (
    explicitOrdMatch ||
    lower.includes("ট্র্যাক") ||
    lower.includes("track") ||
    lower.includes("অর্ডারের অবস্থা") ||
    lower.includes("আমার অর্ডার") ||
    lower.includes("order status")
  ) {
    if (lower.includes("আমার সকল অর্ডার") || lower.includes("অর্ডার তালিকা") || lower.includes("my orders")) {
      return { intent: "my_orders" };
    }
    return {
      intent: "track_order",
      orderIdentifier: explicitOrdMatch ? explicitOrdMatch[0] : ordMatch?.[1],
    };
  }

  // 2. Cart Intent
  if (
    lower.includes("কার্টে") ||
    lower.includes("কার্ট") ||
    lower.includes("cart") ||
    lower.includes("ব্যাগে") ||
    lower.includes("কিনতে চাই")
  ) {
    if (lower.includes("কার্টে কী আছে") || lower.includes("কার্ট দেখাও") || lower.includes("view cart")) {
      return { intent: "cart_view" };
    }

    // Check quantity in Bengali or English digits
    const qtyBn = message.match(/([০-৯\d]+)\s*(?:টি|প্যাকেট|বস্তা|কেজি|লিটার|টা)/);
    let qty = 1;
    if (qtyBn && qtyBn[1]) {
      const bnDigits: Record<string, string> = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };
      const converted = qtyBn[1].replace(/[০-৯]/g, (d) => bnDigits[d] || d);
      qty = parseInt(converted, 10) || 1;
    }

    return {
      intent: "cart_add",
      targetProduct: trimmed,
      quantity: qty,
    };
  }

  // 3. Comparison Intent
  if (
    lower.includes("তুলনা") ||
    lower.includes("compare") ||
    lower.includes("বনাম") ||
    lower.includes(" vs ") ||
    lower.includes("পার্থক্য")
  ) {
    const rawTokens = trimmed
      .replace(/তুলনা\s*করো|তুলনা|compare|vs|বনাম|পার্থক্য/gi, ",")
      .split(/,|এবং|ও|and/)
      .map((t) => t.trim())
      .filter((t) => t.length > 2);

    return {
      intent: "compare",
      productNamesToCompare: rawTokens.slice(0, 3),
    };
  }

  // 4. Recommendation Intent
  if (
    lower.includes("পরামর্শ") ||
    lower.includes("সাজেস্ট") ||
    lower.includes("recommend") ||
    lower.includes("কোনটি ভালো") ||
    lower.includes("কী ব্যবহার করব") ||
    lower.includes("রোগ") ||
    lower.includes("বালাই") ||
    lower.includes("পোকা") ||
    lower.includes("ব্লাস্ট") ||
    lower.includes("ধসা")
  ) {
    let crop = "";
    if (lower.includes("ধান") || lower.includes("rice") || lower.includes("paddy")) crop = "ধান";
    else if (lower.includes("আলু") || lower.includes("potato")) crop = "আলু";
    else if (lower.includes("টমেটো") || lower.includes("tomato")) crop = "টমেটো";
    else if (lower.includes("গম") || lower.includes("wheat")) crop = "গম";
    else if (lower.includes("ভুট্টা") || lower.includes("corn")) crop = "ভুট্টা";
    else if (lower.includes("আম") || lower.includes("mango")) crop = "আম";

    return {
      intent: "recommend",
      crop,
      queryText: trimmed,
    };
  }

  // 5. Price / Budget extraction
  let maxPrice: number | undefined;
  const priceMatch = message.match(/([০-৯\d]+)\s*(?:টাকা|টাকার|tk|bdt)/i);
  if (priceMatch && priceMatch[1]) {
    const bnDigits: Record<string, string> = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };
    const converted = priceMatch[1].replace(/[০-৯]/g, (d) => bnDigits[d] || d);
    maxPrice = parseInt(converted, 10);
  }

  // 6. Category extraction
  let category: string | undefined;
  if (lower.includes("বীজ") || lower.includes("seed")) category = "Seeds";
  else if (lower.includes("সার") || lower.includes("fertilizer") || lower.includes("ভার্মিকম্পোস্ট") || lower.includes("ইউরিয়া")) category = "Fertilizers";
  else if (lower.includes("কীটনাশক") || lower.includes("pesticide") || lower.includes("বালাইনাশক")) category = "Pesticides";
  else if (lower.includes("আগাছানাশক") || lower.includes("herbicide")) category = "Herbicides";
  else if (lower.includes("সেচ") || lower.includes("পাম্প") || lower.includes("pump") || lower.includes("irrigation")) category = "Irrigation Equipment";
  else if (lower.includes("যন্ত্রপাতি") || lower.includes("মেশিন") || lower.includes("machinery") || lower.includes("tiller") || lower.includes("টিলার")) category = "Agricultural Machinery";
  else if (lower.includes("সরঞ্জাম") || lower.includes("কাঁচি") || lower.includes("কোদাল") || lower.includes("tools")) category = "Farm Tools";

  // 7. Greeting / Help
  if (
    trimmed === "হাই" ||
    trimmed === "হ্যালো" ||
    trimmed.toLowerCase() === "hi" ||
    trimmed.toLowerCase() === "hello" ||
    trimmed.toLowerCase() === "help"
  ) {
    return { intent: "greeting" };
  }

  // Default: Product Search
  return {
    intent: "search",
    queryText: trimmed,
    category,
    maxPrice,
  };
}

// ==========================================
// GEMINI API INTEGRATION WITH FUNCTION CALLING
// ==========================================

async function callGeminiAssistant(
  apiKey: string,
  userMessage: string,
  history: Array<{ role: string; content: string }>,
  userId?: string
): Promise<AIShoppingResponse | null> {
  try {
    const systemInstruction = `You are "AgroMart AI Shopping Assistant", an expert, helpful, and friendly agricultural e-commerce shopping consultant for farmers and agricultural buyers in Bangladesh.
Your goals:
1. Help users discover, search, recommend, and compare real farm inputs (Seeds, Organic/Chemical Fertilizers, Pesticides, Herbicides, Irrigation Pumps, Modern Farm Machinery).
2. NEVER invent fake product names, prices, or inventory. You have specialized tools to query the real database.
3. Language: Fluent in both Bengali (বাংলা) and English. If the user writes in Bengali, reply in polite Bengali.
4. For any chemical inputs (pesticides, inorganic fertilizers), always remind farmers to follow label dosages and consult their local Upazila Sub-Assistant Agriculture Officer (SAAO / উপসহকারী কৃষি কর্মকর্তা).
5. For order tracking, explain that tracking requires authentication and provide their live status if found.
6. For shopping cart, ask confirmation before directing them to checkout.`;

    // Tool declarations for Gemini REST API
    const tools = [
      {
        function_declarations: [
          {
            name: "search_products",
            description: "Search for real agricultural products in the AgroMart database by keywords, category, or price range.",
            parameters: {
              type: "OBJECT",
              properties: {
                query: { type: "STRING", description: "Search term like tomato seed, urea, sprayer" },
                category: { type: "STRING", description: "Category name e.g. Seeds, Fertilizers, Pesticides, Agricultural Machinery, Irrigation Equipment" },
                maxPrice: { type: "NUMBER", description: "Maximum price filter in BDT" },
                minPrice: { type: "NUMBER", description: "Minimum price filter in BDT" },
              },
            },
          },
          {
            name: "compare_products",
            description: "Compare two to three products side-by-side using real database attributes.",
            parameters: {
              type: "OBJECT",
              properties: {
                productNames: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                  description: "Names or keywords of products to compare",
                },
              },
              required: ["productNames"],
            },
          },
          {
            name: "track_order",
            description: "Track an order using order number (e.g., ORD-24766211) or fetch the customer's recent orders.",
            parameters: {
              type: "OBJECT",
              properties: {
                orderNumber: { type: "STRING", description: "Order number or ID" },
              },
            },
          },
        ],
      },
    ];

    // Format contents
    const contents: any[] = [];
    // Last 6 turns for context
    const recent = history.slice(-6);
    for (const h of recent) {
      contents.push({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      });
    }
    contents.push({
      role: "user",
      parts: [{ text: userMessage }],
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const initialRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        tools,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!initialRes.ok) {
      console.warn("Gemini API call failed with status:", initialRes.status);
      return null;
    }

    const data = await initialRes.json();
    const candidate = data?.candidates?.[0];
    const functionCalls = candidate?.content?.parts?.filter((p: any) => p.functionCall);

    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0].functionCall;
      const fnName = call.name;
      const args = call.args || {};

      if (fnName === "search_products") {
        const found = await searchProductsTool({
          query: args.query,
          category: args.category,
          minPrice: args.minPrice,
          maxPrice: args.maxPrice,
          limit: 6,
        });

        const reply = found.length > 0
          ? `আপনার অনুসন্ধানের ভিত্তিতে ডেটাবেজ থেকে ${found.length} টি অনুমোদিত পণ্য পাওয়া গেছে:`
          : "দুঃখিত, আপনার প্রদত্ত মানদণ্ড অনুযায়ী কোনো পণ্য পাওয়া যায়নি। বিকল্প ক্যাটাগরি বা অন্য বাজেটে অনুসন্ধান করুন।";

        return {
          reply,
          action: "search",
          products: found,
          suggestions: ["কম দামের পণ্য দেখাও", "অর্গানিক সার খুঁজুন", "ডেলিভারি নিয়ম জানুন"],
          safetyWarning: args.category?.includes("Pesticide") || args.category?.includes("Fertilizer") ? AGRI_SAFETY_DISCLAIMER_BN : undefined,
          provider: "gemini",
        };
      }

      if (fnName === "compare_products") {
        const pNames = args.productNames || [];
        const items = await compareProductsTool(pNames);
        return {
          reply: items.length > 0
            ? "আপনার অনুরোধকৃত পণ্যগুলোর বিস্তারিত তুলনা নিচে উপস্থাপন করা হলো:"
            : "দুঃখিত, তুলনার জন্য কাঙ্ক্ষিত পণ্যগুলো খুঁজে পাওয়া যায়নি।",
          action: "compare",
          comparison: {
            title: "পণ্যসমূহের তুলনামূলক বিশ্লেষণ",
            items,
          },
          suggestions: ["কার্টে যোগ করুন", "অন্যান্য বিকল্প দেখুন", "কৃষি ব্লগ পড়ুন"],
          provider: "gemini",
        };
      }

      if (fnName === "track_order") {
        if (!userId) {
          return {
            reply: "অর্ডার ট্র্যাকিং ও বিস্তারিত তথ্যের জন্য অনুগ্রহ করে আপনার অ্যাকাউন্টে লগইন করুন। লগইন করার পর সরাসরি লাইভ কুরিয়ার ট্র্যাকিং দেখতে পাবেন।",
            action: "general",
            suggestions: ["লগইন করুন", "জনপ্রিয় পণ্য দেখুন", "অ্যাসিস্ট্যান্ট সম্পর্কে জানুন"],
            provider: "gemini",
          };
        }

        const ord = await getOrderTrackingTool(args.orderNumber || "", userId);
        if (ord) {
          const statusKey = String(ord.status).toUpperCase();
          return {
            reply: `আপনার অর্ডার নম্বর **${ord.orderNumber}** এর বর্তমান অবস্থা: **${STATUS_LABELS[statusKey] || ord.status}**`,
            action: "order_tracking",
            orderInfo: {
              orderNumber: ord.orderNumber || `#ORD-${String(ord._id).slice(-6)}`,
              status: ord.status,
              statusLabel: STATUS_LABELS[statusKey] || ord.status,
              totalAmount: ord.totalAmount,
              itemsCount: ord.items?.length || 1,
              createdAt: new Date(ord.createdAt).toLocaleDateString("bn-BD"),
              courierName: ord.courierName,
              trackingNumber: ord.trackingNumber,
              estimatedDeliveryDate: ord.estimatedDeliveryDate ? String(ord.estimatedDeliveryDate) : undefined,
              orderId: String(ord._id),
            },
            suggestions: ["অর্ডারের লাইভ পেজে যান", "আরও পণ্য কিনুন", "কুরিয়ার হটলাইন"],
            provider: "gemini",
          };
        }
      }
    }

    // Direct text response
    const textPart = candidate?.content?.parts?.find((p: any) => p.text);
    if (textPart && textPart.text) {
      return {
        reply: textPart.text,
        action: "general",
        suggestions: ["বীজ অনুসন্ধান", "জৈব সার তালিকা", "স্প্রে মেশিন"],
        provider: "gemini",
      };
    }

    return null;
  } catch (err) {
    console.warn("Gemini Execution Error, falling back to built-in Agri Engine:", err);
    return null;
  }
}

// ==========================================
// BUILT-IN INTELLIGENT AGRO ENGINE (GUARANTEED REAL DB)
// ==========================================

export async function processAIChatMessage(
  userMessage: string,
  history: Array<{ role: string; content: string }> = [],
  user?: IUser
): Promise<AIShoppingResponse> {
  const userId = user?._id ? String(user._id) : undefined;
  const geminiKey = process.env.GEMINI_API_KEY;

  // 1. Try Gemini Provider if API Key is configured
  if (geminiKey && geminiKey.trim()) {
    const geminiRes = await callGeminiAssistant(geminiKey, userMessage, history, userId);
    if (geminiRes) {
      return geminiRes;
    }
  }

  // 2. Intelligent Built-in Agricultural Engine (100% Real DB Query)
  const parsed = parseUserIntent(userMessage);

  // A. Greeting
  if (parsed.intent === "greeting") {
    const userName = user?.name ? `${user.name} ভাই` : "সম্মানিত খামারি ও ক্রেতা বন্ধু";
    return {
      reply: `স্বাগতম ${userName}! আমি **AgroMart AI Shopping Assistant**। 🌾\n\nন্যায্য মূল্যে খাঁটি বীজ, অনুখাদ্য সার, আধুনিক কৃষি যন্ত্রপাতি ও বালাইনাশক খুঁজে দিতে আমি প্রস্তুত। আপনি যে কোনো প্রশ্ন করতে পারেন:`,
      action: "general",
      suggestions: [
        "৫০০ টাকার মধ্যে সবজির বীজ দেখাও",
        "জৈব ও ভার্মিকম্পোস্ট সার আছে?",
        "স্প্রে মেশিন ও খামার যন্ত্রপাতি",
        "আমার অর্ডারের অবস্থা কী?",
      ],
      provider: "builtin-agrimart-engine",
    };
  }

  // B. Order Tracking
  if (parsed.intent === "track_order") {
    if (!userId) {
      return {
        reply: "আপনার অর্ডারের লাইভ ট্র্যাকিং তথ্য দেখতে অনুগ্রহ করে প্রথমে আপনার অ্যাকাউন্টে **লগইন** করুন। লগইন করার পর আপনার সকল চলমান ডেলিভারির সর্বশেষ অবস্থা এখানে দেখতে পাবেন।",
        action: "general",
        suggestions: ["লগইন করুন", "জনপ্রিয় বীজ দেখুন", "জৈব সার তালিকা"],
        provider: "builtin-agrimart-engine",
      };
    }

    let ord: IOrder | null = null;
    if (parsed.orderIdentifier) {
      ord = await getOrderTrackingTool(parsed.orderIdentifier, userId);
    }

    if (!ord) {
      const recent = await getUserOrdersTool(userId, 1);
      if (recent.length > 0) ord = recent[0];
    }

    if (ord) {
      const statusKey = String(ord.status).toUpperCase();
      const statusLabel = STATUS_LABELS[statusKey] || ord.status;
      const orderNum = ord.orderNumber || `#ORD-${String(ord._id).slice(-6)}`;

      return {
        reply: `আপনার অর্ডার **${orderNum}** সফলভাবে পাওয়া গেছে। বর্তমান স্ট্যাটাস: **${statusLabel}**।\n\nআপনি সরাসরি ট্র্যাক বাটনে ক্লিক করে লাইভ কুরিয়ার ও শিপমেন্টের বিস্তারিত দেখতে পারেন।`,
        action: "order_tracking",
        orderInfo: {
          orderNumber: orderNum,
          status: ord.status,
          statusLabel,
          totalAmount: ord.totalAmount,
          itemsCount: ord.items?.length || 1,
          createdAt: new Date(ord.createdAt).toLocaleDateString("bn-BD"),
          courierName: ord.courierName,
          trackingNumber: ord.trackingNumber,
          estimatedDeliveryDate: ord.estimatedDeliveryDate ? String(ord.estimatedDeliveryDate) : undefined,
          orderId: String(ord._id),
        },
        suggestions: ["আমার সকল অর্ডার দেখাও", "আরও বীজ কিনুন", "কৃষি পরামর্শক"],
        provider: "builtin-agrimart-engine",
      };
    }

    return {
      reply: "আপনার অ্যাকাউন্টে কোনো সক্রিয় অর্ডার খুঁজে পাওয়া যায়নি। মার্কেটপ্লেস থেকে আপনার প্রয়োজনীয় বীজ, সার বা যন্ত্রপাতি অর্ডার করুন।",
      action: "general",
      suggestions: ["পণ্য অনুসন্ধান করুন", "উন্নত জাতের বীজ", "আধুনিক কৃষি যন্ত্রপাতি"],
      provider: "builtin-agrimart-engine",
    };
  }

  // C. My Orders List
  if (parsed.intent === "my_orders") {
    if (!userId) {
      return {
        reply: "আপনার পূর্ববর্তী সকল অর্ডার তালিকা দেখতে অনুগ্রহ করে প্রথমে লগইন করুন।",
        action: "general",
        suggestions: ["লগইন করুন", "পণ্য অনুসন্ধান"],
        provider: "builtin-agrimart-engine",
      };
    }

    const myOrders = await getUserOrdersTool(userId, 5);
    if (myOrders.length === 0) {
      return {
        reply: "আপনার কোনো পূর্ববর্তী অর্ডার নেই। মার্কেটপ্লেসের সকল সামগ্রী দেখে অর্ডার করুন।",
        action: "general",
        suggestions: ["সবজির বীজ দেখুন", "জৈব সার", "খামার সরঞ্জাম"],
        provider: "builtin-agrimart-engine",
      };
    }

    return {
      reply: `আপনার সর্বশেষ ${myOrders.length} টি অর্ডারের সংক্ষিপ্ত বিবরণ নিচে দেওয়া হলো:`,
      action: "general",
      userOrders: myOrders.map((o) => {
        const statusKey = String(o.status).toUpperCase();
        return {
          orderId: String(o._id),
          orderNumber: o.orderNumber || `#ORD-${String(o._id).slice(-6)}`,
          status: o.status,
          statusLabel: STATUS_LABELS[statusKey] || o.status,
          totalAmount: o.totalAmount,
          itemsCount: o.items?.length || 1,
          createdAt: new Date(o.createdAt).toLocaleDateString("bn-BD"),
        };
      }),
      suggestions: ["সর্বশেষ অর্ডার ট্র্যাক করুন", "নতুন অর্ডার করুন", "কৃষি টিপস"],
      provider: "builtin-agrimart-engine",
    };
  }

  // D. Cart Actions
  if (parsed.intent === "cart_view") {
    return {
      reply: "আপনার বর্তমান শপিং কার্টের সামগ্রী দেখতে নিচের বোতাম ব্যবহার করুন অথবা সরাসরি চেকআউট পেজে এগিয়ে যান।",
      action: "cart_view",
      cartAction: {
        type: "view",
        cartSummary: "আপনার কার্টের সার্বিক আইটেম ও মূল্য সরাসরি উপরে কার্ট আইকন থেকে নিয়ন্ত্রণ করতে পারবেন।",
      },
      suggestions: ["চেকআউট করুন", "আরও পণ্য যোগ করুন", "অর্গানিক সার দেখাও"],
      provider: "builtin-agrimart-engine",
    };
  }

  if (parsed.intent === "cart_add") {
    // Find closest product from database by stripping action verbs and particles
    const cleanTerm = (parsed.targetProduct || "")
      .replace(/কার্টে|যোগ|করো|কার্ডে|দাও|রাখো|add|to|cart|কিনতে|চাই|প্যাকেট|কেজি|লিটার|বস্তা|টি|টা|এর|হিসেবে|প্লিজ|please|[০-৯\d]+/gi, " ")
      .trim();

    let matched = await searchProductsTool({ query: cleanTerm, limit: 3 });
    if (matched.length === 0 && cleanTerm.length > 3) {
      // Try first word of cleanTerm
      const firstWord = cleanTerm.split(/\s+/)[0];
      if (firstWord.length > 2) {
        matched = await searchProductsTool({ query: firstWord, limit: 3 });
      }
    }

    if (matched.length > 0) {
      const targetProd = matched[0];
      const qty = parsed.quantity || 1;
      const total = targetProd.price * qty;

      return {
        reply: `**${targetProd.name}** এর **${qty} ${targetProd.unit || "টি"}** কার্টে যোগ করার প্রস্তুত। নিশ্চিত করতে নিচের কনফার্ম বাটনে চাপ দিন:`,
        action: "cart_add_confirm",
        cartAction: {
          type: "add",
          product: targetProd,
          quantity: qty,
          totalPrice: total,
        },
        products: [targetProd],
        suggestions: ["কনফার্ম করে কার্টে যোগ করুন", "অন্য পণ্য দেখুন", "কার্ট দেখুন"],
        provider: "builtin-agrimart-engine",
      };
    }
  }

  // E. Comparison
  if (parsed.intent === "compare" && parsed.productNamesToCompare && parsed.productNamesToCompare.length > 0) {
    let items = await compareProductsTool(parsed.productNamesToCompare);

    if (items.length === 0) {
      // Fallback: pick 2 top distinct products from DB to demonstrate comparison
      const topProducts = await searchProductsTool({ limit: 2 });
      if (topProducts.length >= 2) {
        items = topProducts.map((p) => ({
          id: p._id,
          name: p.name,
          category: p.category || "তথ্য উপলব্ধ নয়",
          price: p.price,
          unit: p.unit || "প্যাকেট",
          description: p.description || "তথ্য উপলব্ধ নয়",
          stock: p.availableStock,
          stockStatus: p.inStock ? `স্টকে আছে (${p.availableStock} ${p.unit || "টি"})` : "স্টক শেষ",
          seller: p.sellerName || "তথ্য উপলব্ধ নয়",
          image: p.image,
        }));
      }
    }

    return {
      reply: items.length > 0
        ? `নিচে **${items.map((i) => i.name).join(" ও ")}** এর বিস্তারিত স্পেসিফিকেশন ও মূল্য তুলনা তুলে ধরা হলো:`
        : "তুলনা করার মতো পর্যাপ্ত পণ্য ডাটাবেজে পাওয়া যায়নি।",
      action: "compare",
      comparison: {
        title: "পণ্যের তুলনামূলক বিবরণ",
        items,
      },
      suggestions: ["সবচেয়ে সাশ্রয়ী কোনটি?", "কার্টে যোগ করুন", "অন্য দুটি পণ্য তুলনা করুন"],
      provider: "builtin-agrimart-engine",
    };
  }

  // F. Recommendations
  if (parsed.intent === "recommend") {
    let searchCriteria: any = { limit: 4 };
    let rationale = "";

    if (parsed.crop === "ধান") {
      searchCriteria.query = "rice";
      rationale = "ধান চাষের জন্য উচ্চ ফলনশীল ও পুষ্টি সহনশীল বীজ এবং প্রয়োজনীয় সার নিচে দেওয়া হলো:";
    } else if (parsed.crop === "টমেটো") {
      searchCriteria.query = "tomato";
      rationale = "টমেটো চাষ ও কুঁড়ি ঝরা বন্ধে উপযুক্ত বীজ ও অনুখাদ্য তালিকা:";
    } else if (parsed.crop === "আলু") {
      searchCriteria.query = "potato";
      rationale = "আলুর নাবি ধসা রোগ প্রতিরোধ ও সুষম বৃদ্ধি সহায়ক সামগ্রী:";
    } else {
      searchCriteria.query = parsed.queryText?.slice(0, 20);
      rationale = "আপনার চাহিদার আলোকে ডেটাবেজ থেকে সেরা মানসম্মত কৃষি উপকরণের সুপারিশ:";
    }

    let products = await searchProductsTool(searchCriteria);
    if (products.length === 0) {
      products = await searchProductsTool({ limit: 4 });
    }

    return {
      reply: rationale,
      action: "recommend",
      products,
      suggestions: [
        "সার প্রয়োগের সঠিক মাত্রা কী?",
        "বাজেট অনুযায়ী অন্যান্য বিকল্প",
        "কীটনাশক সতর্কতা",
      ],
      safetyWarning: AGRI_SAFETY_DISCLAIMER_BN,
      provider: "builtin-agrimart-engine",
    };
  }

  // G. Product Search (Default)
  const products = await searchProductsTool({
    query: parsed.queryText,
    category: parsed.category,
    maxPrice: parsed.maxPrice,
    limit: 6,
  });

  if (products.length > 0) {
    let replyText = `আপনার অনুসন্ধানের ভিত্তিতে ডেটাবেজ থেকে **${products.length} টি** অনুমোদিত পণ্য পাওয়া গেছে:`;
    if (parsed.maxPrice) {
      replyText = `৳ **${parsed.maxPrice}** টাকার বাজেটে প্রাপ্ত সেরা মানসম্পন্ন সামগ্রী:`;
    }

    const needsSafety = products.some(
      (p) =>
        p.category?.toLowerCase().includes("pesticide") ||
        p.category?.toLowerCase().includes("fertilizer") ||
        p.category?.toLowerCase().includes("herbicide")
    );

    return {
      reply: replyText,
      action: "search",
      products,
      suggestions: [
        "কম মূল্যের পণ্য দেখাও",
        "দুটি পণ্য তুলনা করো",
        "অর্ডারের অবস্থা কী?",
      ],
      safetyWarning: needsSafety ? AGRI_SAFETY_DISCLAIMER_BN : undefined,
      provider: "builtin-agrimart-engine",
    };
  }

  // Fallback: If no exact search matched, show popular categories
  const featured = await searchProductsTool({ limit: 4 });
  return {
    reply: `দুঃখিত, "${userMessage}" এর সাথে হুবহু মিল রেখে কোনো পণ্য পাওয়া যায়নি। তবে আপনি নিচের জনপ্রিয় পণ্যসমূহ দেখতে পারেন অথবা ভিন্ন শব্দে অনুসন্ধান করতে পারেন:`,
    action: "search",
    products: featured,
    suggestions: [
      "উন্নত জাতের বীজ",
      "জৈব ও সুষম সার",
      "সেচ পাম্প ও আধুনিক যন্ত্রপাতি",
    ],
    provider: "builtin-agrimart-engine",
  };
}
