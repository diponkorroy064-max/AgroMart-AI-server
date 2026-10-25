import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { client } from '../db/db';
import { ICategory, ISubcategory, CategoryStatus } from '../models/Category';
import { IProduct } from '../models/Product';
import { AuthenticatedRequest } from '../types/express';

const categoriesCollection = client.db('AgroMart').collection<ICategory>('categories');
const subcategoriesCollection = client.db('AgroMart').collection<ISubcategory>('subcategories');
const productsCollection = client.db('AgroMart').collection<IProduct>('products');

/**
 * Safely convert string to ObjectId
 */
export const toObjectId = (id?: string | string[] | ObjectId): ObjectId | null => {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  const idStr = Array.isArray(id) ? id[0] : String(id);
  return ObjectId.isValid(idStr) ? new ObjectId(idStr) : null;
};

/**
 * Generate a clean URL slug from name
 */
export const generateSlug = (name: string): string => {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\u0980-\u09FF-]/g, '') // keep alphanumeric, spaces, bangla unicode, hyphens
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

/**
 * Default Seed Categories & Subcategories for Agriculture
 */
export const DEFAULT_AGRICULTURAL_CATEGORIES = [
  {
    name: 'সার ও অনুখাদ্য (Fertilizers)',
    slug: 'fertilizers',
    description: 'ফসলের পুষ্টি ও মাটির উর্বরতা বৃদ্ধির জন্য সকল প্রকার রাসায়নিক, জৈব ও অনুখাদ্য সার।',
    image: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&w=600&q=75',
    order: 1,
    subcategories: [
      { name: 'ইউরিয়া ও নাইট্রোজেন সার', slug: 'urea-nitrogen', description: 'ইউরিয়া ও দ্রুত দ্রবণীয় নাইট্রোজেন জাতীয় সার।' },
      { name: 'ফসফেট ও টিএসপি সার', slug: 'tsp-phosphate', description: 'টিএসপি ও ডিএপি জাতীয় মূল শিকড় বৃদ্ধির সার।' },
      { name: 'পটাশ ও এমওপি সার', slug: 'potash-mop', description: 'এমওপি ও ফলন পরিপক্কতাকারী পটাশ সার।' },
      { name: 'জৈব ও ভার্মিকম্পোস্ট সার', slug: 'organic-vermicompost', description: 'কেঁচো সার, গোবর সার ও প্রাকৃতিক অনুখাদ্য।' },
      { name: 'তরল ও ফলিয়ার স্প্রে অনুখাদ্য', slug: 'foliar-spray', description: 'পাতায় স্প্রে করার মতো জিংক, বোরন ও চিলেটেড পুষ্টি।' },
    ],
  },
  {
    name: 'উন্নত জাতের বীজ (Seeds)',
    slug: 'seeds',
    description: 'উচ্চ ফলনশীল ও রোগ প্রতিরোধী ধান, শস্য, শাকসবজি ও ফলের হাইব্রিড বীজ।',
    image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=75',
    order: 2,
    subcategories: [
      { name: 'ধান ও শস্য বীজ', slug: 'paddy-grain-seeds', description: 'উফশী ও হাইব্রিড আউশ, আমন ও বোরো ধান বীজ।' },
      { name: 'সবজি ও মরিচ বীজ', slug: 'vegetable-seeds', description: 'টমেটো, বেগুন, লাউ, শসা ও মরিচের হাইব্রিড বীজ।' },
      { name: 'তেলবীজ ও ডাল শস্য', slug: 'oilseeds-pulses', description: 'সরিষা, সূর্যমুখী, মসুর ও মুগ ডালের বীজ।' },
      { name: 'ফলের বীজ ও কলম চারা', slug: 'fruit-seedlings', description: 'উন্নত জাতের আম, পেয়ারা ও লেবুর কলম চারা।' },
      { name: 'ঘাস ও গো-খাদ্য বীজ', slug: 'forage-seeds', description: 'নেপিয়ার ও ভুট্টা ঘাসের উন্নত জাতের বীজ।' },
    ],
  },
  {
    name: 'কীটনাশক ও বালাইনাশক (Pesticides)',
    slug: 'pesticides',
    description: 'ফসল সুরক্ষায় পোকা-মাকড় ও রোগবালাই প্রতিরোধক কার্যকরী কীটনাশক ও ছত্রাকনাশক।',
    image: 'https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&w=600&q=75',
    order: 3,
    subcategories: [
      { name: 'রাসায়নিক কীটনাশক', slug: 'chemical-insecticides', description: 'মাজরা, পাতা মোড়ানো ও শোষক পোকা দমনের স্প্রে।' },
      { name: 'জৈব ও ভেষজ বালাইনাশক', slug: 'bio-pesticides', description: 'নিমতেল ও ভেষজ উপাদানে তৈরি পরিবেশবান্ধব স্প্রে।' },
      { name: 'ছত্রাকনাশক (Fungicides)', slug: 'fungicides', description: 'ব্লাইট, পচা ও ড্যাম্পিং অফ রোগ নিরাময়ক।' },
      { name: 'কৃমি ও শামুকনাশক', slug: 'nematicides-molluscicides', description: 'মাটির ক্ষতিকর কৃমি ও শামুক নিয়ন্ত্রক।' },
    ],
  },
  {
    name: 'আগাছানাশক (Herbicides)',
    slug: 'herbicides',
    description: 'ফসলের ক্ষতিকর আগাছা দমন ও পরিষ্কার চাষাবাদের জন্য অনুমোদিত আগাছানাশক।',
    image: 'https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&w=600&q=75',
    order: 4,
    subcategories: [
      { name: 'ধানের আগাছানাশক', slug: 'paddy-herbicides', description: 'চারা ও বোনা ধানের আগাছা নিয়ন্ত্রণকারী ওষুধ।' },
      { name: 'সবজি ও ডাল ফসলের আগাছানাশক', slug: 'vegetable-herbicides', description: 'রবিশস্য ও সবজি ক্ষেতের নির্বাচিত আগাছানাশক।' },
      { name: 'সার্বিক অনির্বাচিত আগাছানাশক', slug: 'non-selective-herbicides', description: 'জমি প্রস্তুত ও পতিত জমির ঘাস পরিষ্কারের স্প্রে।' },
    ],
  },
  {
    name: 'আধুনিক কৃষি যন্ত্রপাতি (Agricultural Machinery)',
    slug: 'agricultural-machinery',
    description: 'চাষাবাদ, রোপণ ও ফসল কাটার শক্তিশালী ইঞ্জিনচালিত আধুনিক খামার যন্ত্রপাতি।',
    image: 'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=600&q=75',
    order: 5,
    subcategories: [
      { name: 'পাওয়ার টিলার ও মিনি ট্রাক্টর', slug: 'power-tillers-tractors', description: 'জমি চাষ ও মই দেওয়ার ইঞ্জিনচালিত আধুনিক মেশিন।' },
      { name: 'হারভেস্টার ও কম্বাইন রিপার', slug: 'reapers-harvesters', description: 'দ্রুত ধান ও গম কাটার আধুনিক যন্ত্র।' },
      { name: 'মাড়াই ও ঝাড়াই কল (Threshers)', slug: 'threshers', description: 'ফসল মাড়াই ও পরিষ্কার করার স্বয়ংক্রিয় মেশিন।' },
      { name: 'পাওয়ার উইডার ও কাল্টিভেটর', slug: 'power-weeders', description: 'সারিবদ্ধ ফসলের মাটি নিড়ানি ও আলগা করার যন্ত্র।' },
    ],
  },
  {
    name: 'সেচ ব্যবস্থা ও সরঞ্জাম (Irrigation Equipment)',
    slug: 'irrigation-equipment',
    description: 'স্বল্প খরচে দক্ষ পানিসম্পদ ব্যবস্থাপনা, ড্রিপ, স্প্রিংকলার ও সেচ পাম্পিং সিস্টেম।',
    image: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=600&q=75',
    order: 6,
    subcategories: [
      { name: 'সাবমার্সিবল ও সোলার সেচ পাম্প', slug: 'submersible-solar-pumps', description: 'ডিসি ও এসি গভীর নলকূপের পানি উত্তোলক পাম্প।' },
      { name: 'ড্রিপ ও ফগিং ইরিগেশন কিট', slug: 'drip-mist-irrigation', description: 'গাছের গোড়ায় ফোঁটায় ফোঁটায় সুষম পানি সরবরাহ।' },
      { name: 'স্প্রিংকলার ও সেচ স্প্রেয়ার', slug: 'sprinklers-spray', description: 'বৃষ্টির মতো পানি ছিটানোর বহুমুখী নজল ও রোটেটর।' },
      { name: 'সেচ পাইপ ও ডেলিভারি হোস', slug: 'irrigation-pipes-hoses', description: 'ফিতা পাইপ, পিভিসি ও এইচডিপিই টেকসই সেচ লাইন।' },
    ],
  },
  {
    name: 'কৃষি সরঞ্জাম ও সুরক্ষা (Farming Tools)',
    slug: 'farming-tools',
    description: 'দৈনন্দিন বাগান ও খামার কাজের টেকসই হস্তচালিত কাটিং, খনন ও সুরক্ষা সরঞ্জাম।',
    image: 'https://images.unsplash.com/photo-1527842891421-42eec6e703ea?auto=format&fit=crop&w=600&q=75',
    order: 7,
    subcategories: [
      { name: 'প্রুনিং শিয়ার ও গাছের কাঁচি', slug: 'pruning-shears', description: 'ফলের ডালপালা ছাঁটাই ও কলমের কাটিং কাঁচি।' },
      { name: 'কোদাল, নিড়ানি ও কাস্তে', slug: 'spades-sickles-hoes', description: 'মাটি কাটা, ফসল কাটা ও আগাছা নিড়ানোর হাতিয়ার।' },
      { name: 'হ্যান্ড ও ন্যাপস্যাক স্প্রেয়ার', slug: 'knapsack-sprayers', description: 'কীটনাশক ও ভিটামিন স্প্রে করার প্রেসার বোতল।' },
      { name: 'খামারি সুরক্ষা পোশাক ও গ্লাভস', slug: 'farm-safety-gear', description: 'কীটনাশক প্রতিরোধী মাস্ক, অ্যাপ্রন ও বুট জুতো।' },
    ],
  },
];

/**
 * Seed initial categories if none exist
 */
export const seedCategoriesIfEmpty = async () => {
  try {
    const count = await categoriesCollection.countDocuments();
    if (count > 0) return;

    console.log('[CategorySeeder]: Seeding initial agricultural categories & subcategories...');
    const now = new Date();

    for (const catData of DEFAULT_AGRICULTURAL_CATEGORIES) {
      const { subcategories, ...catFields } = catData;
      const categoryDoc: ICategory = {
        ...catFields,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      const result = await categoriesCollection.insertOne(categoryDoc);
      const categoryId = result.insertedId;

      if (subcategories && subcategories.length > 0) {
        const subcategoryDocs: ISubcategory[] = subcategories.map((sub, idx) => ({
          categoryId,
          name: sub.name,
          slug: sub.slug,
          description: sub.description,
          status: 'active',
          order: idx + 1,
          createdAt: now,
          updatedAt: now,
        }));

        await subcategoriesCollection.insertMany(subcategoryDocs);
      }
    }
    console.log('[CategorySeeder]: Seeded successfully!');
  } catch (err) {
    console.error('[CategorySeeder Error]:', err);
  }
};

// ==========================================
// Category APIs
// ==========================================

/**
 * @route   GET /api/categories
 * @desc    Get all categories with subcategories and product counts
 * @access  Public
 */
export const getCategories = async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query as Record<string, string>;

    const filter: any = {};
    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search && search.trim()) {
      filter.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { slug: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const categories = await categoriesCollection
      .find(filter)
      .sort({ order: 1, name: 1 })
      .toArray();

    // Fetch subcategories
    const subFilter: any = {};
    if (status && status !== 'all') {
      subFilter.status = status;
    }
    const allSubcategories = await subcategoriesCollection
      .find(subFilter)
      .sort({ order: 1, name: 1 })
      .toArray();

    // Aggregate product counts per category and subcategory
    const productCountByCategory = await productsCollection
      .aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ])
      .toArray();

    const productCountBySubcategory = await productsCollection
      .aggregate<{ _id: string; count: number }>([
        { $match: { subcategory: { $exists: true, $ne: null } } },
        { $group: { _id: '$subcategory', count: { $sum: 1 } } },
      ])
      .toArray();

    const catCountMap = new Map<string, number>();
    productCountByCategory.forEach((item) => {
      if (item._id) catCountMap.set(String(item._id).toLowerCase(), item.count);
    });

    const subCountMap = new Map<string, number>();
    productCountBySubcategory.forEach((item) => {
      if (item._id) subCountMap.set(String(item._id).toLowerCase(), item.count);
    });

    // Map subcategories to parents
    const subcategoryMap = new Map<string, ISubcategory[]>();
    for (const sub of allSubcategories) {
      const parentIdStr = String(sub.categoryId);
      const subWithCount = {
        ...sub,
        productCount: subCountMap.get(sub.name.toLowerCase()) || subCountMap.get(sub.slug.toLowerCase()) || 0,
      };
      if (!subcategoryMap.has(parentIdStr)) {
        subcategoryMap.set(parentIdStr, []);
      }
      subcategoryMap.get(parentIdStr)!.push(subWithCount);
    }

    // Attach subcategories and counts to categories
    const results = categories.map((cat) => {
      const idStr = String(cat._id);
      const subs = subcategoryMap.get(idStr) || [];
      // Enhanced product count calculation with agricultural alias matching
      let prodCount = 0;
      const lowerName = cat.name.toLowerCase();
      const lowerSlug = cat.slug.toLowerCase();

      productCountByCategory.forEach((item) => {
        if (!item._id) return;
        const prodCat = String(item._id).toLowerCase().trim();
        
        // Direct match
        if (prodCat === lowerSlug || prodCat === lowerName) {
          prodCount += item.count;
          return;
        }

        // Slug normalized (e.g. 'farming-tools' matches 'farm tools')
        const normSlug = lowerSlug.replace(/-/g, ' ');
        if (normSlug === prodCat || (normSlug.length > 3 && prodCat.includes(normSlug))) {
          prodCount += item.count;
          return;
        }

        // Parentheses English keyword: e.g. "(Fertilizers)" -> "fertilizers"
        const engMatch = lowerName.match(/\(([^)]+)\)/);
        if (engMatch && engMatch[1]) {
          const eng = engMatch[1].trim();
          if (eng === prodCat || (eng.length > 3 && prodCat.includes(eng))) {
            prodCount += item.count;
            return;
          }
        }

        // Domain specific agricultural aliases
        if (lowerSlug === 'pesticides' && prodCat === 'crop protection') prodCount += item.count;
        if (lowerSlug === 'agricultural-machinery' && prodCat === 'farm equipment') prodCount += item.count;
        if (lowerSlug === 'irrigation-equipment' && prodCat === 'irrigation') prodCount += item.count;
        if (lowerSlug === 'farming-tools' && (prodCat === 'farm tools' || prodCat === 'testing equipment')) prodCount += item.count;
      });

      return {
        ...cat,
        productCount: prodCount,
        subcategoryCount: subs.length,
        subcategories: subs,
      };
    });

    return res.status(200).json({
      success: true,
      total: results.length,
      categories: results,
    });
  } catch (err: any) {
    console.error('Get Categories Error:', err);
    return res.status(500).json({ message: 'ক্যাটাগরি তালিকা আনতে সমস্যা হয়েছে' });
  }
};

/**
 * @route   GET /api/categories/:id
 * @desc    Get single category by ID with its subcategories
 * @access  Public
 */
export const getCategoryById = async (req: Request, res: Response) => {
  try {
    const catId = toObjectId(req.params.id);
    if (!catId) {
      return res.status(400).json({ message: 'অবৈধ ক্যাটাগরি আইডি' });
    }

    const category = await categoriesCollection.findOne({ _id: catId });
    if (!category) {
      return res.status(404).json({ message: 'ক্যাটাগরিটি খুঁজে পাওয়া যায়নি' });
    }

    const subcategories = await subcategoriesCollection
      .find({ categoryId: catId })
      .sort({ order: 1, name: 1 })
      .toArray();

    const productCount = await productsCollection.countDocuments({
      $or: [
        { categoryId: catId },
        { category: category.name },
        { category: category.slug },
      ],
    });

    return res.status(200).json({
      success: true,
      category: {
        ...category,
        productCount,
        subcategoryCount: subcategories.length,
        subcategories,
      },
    });
  } catch (err: any) {
    console.error('Get Category Error:', err);
    return res.status(500).json({ message: 'ক্যাটাগরি তথ্য আনতে সমস্যা হয়েছে' });
  }
};

/**
 * @route   POST /api/categories
 * @desc    Create a new Category
 * @access  Private (Admin)
 */
export const createCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, slug, description, image, order = 0, status = 'active' } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'ক্যাটাগরির নাম আবশ্যক' });
    }

    const trimmedName = name.trim();
    const finalSlug = slug && slug.trim() ? generateSlug(slug.trim()) : generateSlug(trimmedName);

    // Duplicate check for name or slug
    const existing = await categoriesCollection.findOne({
      $or: [
        { name: { $regex: `^${trimmedName}$`, $options: 'i' } },
        { slug: { $regex: `^${finalSlug}$`, $options: 'i' } },
      ],
    });

    if (existing) {
      return res.status(400).json({
        message: 'একই নাম অথবা স্লাগ (Slug) সম্বলিত ক্যাটাগরি ইতিমধ্যে বিদ্যমান রয়েছে',
      });
    }

    const now = new Date();
    const newCategory: ICategory = {
      name: trimmedName,
      slug: finalSlug,
      description: description ? description.trim() : '',
      image: image ? image.trim() : '',
      status: (status === 'inactive' ? 'inactive' : 'active') as CategoryStatus,
      order: Number(order) || 0,
      createdAt: now,
      updatedAt: now,
    };

    const result = await categoriesCollection.insertOne(newCategory);

    return res.status(201).json({
      success: true,
      message: 'নতুন ক্যাটাগরি সফলভাবে তৈরি করা হয়েছে',
      category: { ...newCategory, _id: result.insertedId, subcategories: [], productCount: 0 },
    });
  } catch (err: any) {
    console.error('Create Category Error:', err);
    return res.status(500).json({ message: 'ক্যাটাগরি সংরক্ষণে ত্রুটি দেখা দিয়েছে' });
  }
};

/**
 * @route   PUT /api/categories/:id
 * @desc    Update an existing Category
 * @access  Private (Admin)
 */
export const updateCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const catId = toObjectId(req.params.id);
    if (!catId) {
      return res.status(400).json({ message: 'অবৈধ ক্যাটাগরি আইডি' });
    }

    const category = await categoriesCollection.findOne({ _id: catId });
    if (!category) {
      return res.status(404).json({ message: 'ক্যাটাগরিটি খুঁজে পাওয়া যায়নি' });
    }

    const { name, slug, description, image, order, status } = req.body;

    const updates: Partial<ICategory> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return res.status(400).json({ message: 'ক্যাটাগরির নাম ফাঁকা রাখা যাবে না' });
      }
      // Check duplicate name
      const duplicate = await categoriesCollection.findOne({
        _id: { $ne: catId },
        name: { $regex: `^${trimmedName}$`, $options: 'i' },
      });
      if (duplicate) {
        return res.status(400).json({ message: 'একই নামের আরেকটি ক্যাটাগরি ইতিমধ্যে রয়েছে' });
      }
      updates.name = trimmedName;
    }

    if (slug !== undefined) {
      const finalSlug = generateSlug(slug.trim());
      const duplicateSlug = await categoriesCollection.findOne({
        _id: { $ne: catId },
        slug: { $regex: `^${finalSlug}$`, $options: 'i' },
      });
      if (duplicateSlug) {
        return res.status(400).json({ message: 'একই স্লাগ (Slug) বিশিষ্ট আরেকটি ক্যাটাগরি ইতিমধ্যে রয়েছে' });
      }
      updates.slug = finalSlug;
    }

    if (description !== undefined) updates.description = String(description).trim();
    if (image !== undefined) updates.image = String(image).trim();
    if (order !== undefined) updates.order = Number(order) || 0;
    if (status !== undefined) updates.status = status === 'inactive' ? 'inactive' : 'active';

    await categoriesCollection.updateOne({ _id: catId }, { $set: updates });

    const updatedDoc = await categoriesCollection.findOne({ _id: catId });

    return res.status(200).json({
      success: true,
      message: 'ক্যাটাগরি সফলভাবে আপডেট করা হয়েছে',
      category: updatedDoc,
    });
  } catch (err: any) {
    console.error('Update Category Error:', err);
    return res.status(500).json({ message: 'ক্যাটাগরি আপডেট করতে সমস্যা হয়েছে' });
  }
};

/**
 * @route   PATCH /api/categories/:id/status
 * @desc    Toggle category status (active/inactive)
 * @access  Private (Admin)
 */
export const toggleCategoryStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const catId = toObjectId(req.params.id);
    if (!catId) {
      return res.status(400).json({ message: 'অবৈধ ক্যাটাগরি আইডি' });
    }

    const { status } = req.body;
    if (status !== 'active' && status !== 'inactive') {
      return res.status(400).json({ message: 'স্ট্যাটাস শুধুমাত্র active অথবা inactive হতে পারে' });
    }

    const result = await categoriesCollection.updateOne(
      { _id: catId },
      { $set: { status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'ক্যাটাগরি খুঁজে পাওয়া যায়নি' });
    }

    return res.status(200).json({
      success: true,
      message: `ক্যাটাগরি সফলভাবে ${status === 'active' ? 'সক্রিয় (Active)' : 'নিষ্ক্রিয় (Inactive)'} করা হয়েছে`,
      status,
    });
  } catch (err: any) {
    console.error('Toggle Category Status Error:', err);
    return res.status(500).json({ message: 'স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে' });
  }
};

/**
 * @route   DELETE /api/categories/:id
 * @desc    Delete a category safely (integrity check for products)
 * @access  Private (Admin)
 */
export const deleteCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const catId = toObjectId(req.params.id);
    if (!catId) {
      return res.status(400).json({ message: 'অবৈধ ক্যাটাগরি আইডি' });
    }

    const category = await categoriesCollection.findOne({ _id: catId });
    if (!category) {
      return res.status(404).json({ message: 'ক্যাটাগরি খুঁজে পাওয়া যায়নি' });
    }

    // Integrity Check: Are there any products in this category?
    const linkedProductCount = await productsCollection.countDocuments({
      $or: [
        { categoryId: catId },
        { category: category.name },
        { category: category.slug },
      ],
    });

    if (linkedProductCount > 0) {
      return res.status(400).json({
        message: `এই ক্যাটাগরির অধীনে মোট ${linkedProductCount} টি পণ্য তালিকাভুক্ত রয়েছে। তাই ডেটা ইন্টিগ্রিটির স্বার্থে এটি সরাসরি ডিলিট করা সম্ভব নয়। আপনি চাইলে ক্যাটাগরিটি 'নিষ্ক্রিয় (Inactive)' করে রাখতে পারেন।`,
        linkedProductCount,
        canDeactivate: true,
      });
    }

    // Delete subcategories under this category
    await subcategoriesCollection.deleteMany({ categoryId: catId });

    // Delete category
    await categoriesCollection.deleteOne({ _id: catId });

    return res.status(200).json({
      success: true,
      message: 'ক্যাটাগরি ও এর অধীনস্থ সাব-ক্যাটাগরি সফলভাবে মুছে ফেলা হয়েছে',
    });
  } catch (err: any) {
    console.error('Delete Category Error:', err);
    return res.status(500).json({ message: 'ক্যাটাগরি ডিলিট করতে সমস্যা হয়েছে' });
  }
};

// ==========================================
// Subcategory APIs
// ==========================================

/**
 * @route   POST /api/categories/:id/subcategories
 * @desc    Create a new subcategory under parent category
 * @access  Private (Admin)
 */
export const createSubcategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const catId = toObjectId(req.params.id);
    if (!catId) {
      return res.status(400).json({ message: 'অবৈধ প্যারেন্ট ক্যাটাগরি আইডি' });
    }

    const parentCategory = await categoriesCollection.findOne({ _id: catId });
    if (!parentCategory) {
      return res.status(404).json({ message: 'মূল ক্যাটাগরিটি খুঁজে পাওয়া যায়নি' });
    }

    const { name, slug, description, image, order = 0, status = 'active' } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'সাব-ক্যাটাগরির নাম আবশ্যক' });
    }

    const trimmedName = name.trim();
    const finalSlug = slug && slug.trim() ? generateSlug(slug.trim()) : generateSlug(trimmedName);

    // Check duplicate subcategory under same parent or global slug
    const duplicate = await subcategoriesCollection.findOne({
      $or: [
        { categoryId: catId, name: { $regex: `^${trimmedName}$`, $options: 'i' } },
        { slug: { $regex: `^${finalSlug}$`, $options: 'i' } },
      ],
    });

    if (duplicate) {
      return res.status(400).json({
        message: 'একই নাম অথবা স্লাগবিশিষ্ট সাব-ক্যাটাগরি ইতিমধ্যে রয়েছে',
      });
    }

    const now = new Date();
    const newSubcategory: ISubcategory = {
      categoryId: catId,
      name: trimmedName,
      slug: finalSlug,
      description: description ? description.trim() : '',
      image: image ? image.trim() : '',
      status: (status === 'inactive' ? 'inactive' : 'active') as CategoryStatus,
      order: Number(order) || 0,
      createdAt: now,
      updatedAt: now,
    };

    const result = await subcategoriesCollection.insertOne(newSubcategory);

    return res.status(201).json({
      success: true,
      message: 'নতুন সাব-ক্যাটাগরি সফলভাবে তৈরি করা হয়েছে',
      subcategory: { ...newSubcategory, _id: result.insertedId, productCount: 0 },
    });
  } catch (err: any) {
    console.error('Create Subcategory Error:', err);
    return res.status(500).json({ message: 'সাব-ক্যাটাগরি সংরক্ষণে ত্রুটি হয়েছে' });
  }
};

/**
 * @route   PUT /api/categories/subcategories/:subId
 * @desc    Update a subcategory
 * @access  Private (Admin)
 */
export const updateSubcategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const subId = toObjectId(req.params.subId);
    if (!subId) {
      return res.status(400).json({ message: 'অবৈধ সাব-ক্যাটাগরি আইডি' });
    }

    const subcategory = await subcategoriesCollection.findOne({ _id: subId });
    if (!subcategory) {
      return res.status(404).json({ message: 'সাব-ক্যাটাগরি খুঁজে পাওয়া যায়নি' });
    }

    const { name, slug, description, image, order, status, categoryId } = req.body;
    const updates: Partial<ISubcategory> = {
      updatedAt: new Date(),
    };

    if (categoryId !== undefined) {
      const parentId = toObjectId(categoryId);
      if (!parentId) {
        return res.status(400).json({ message: 'অবৈধ প্যারেন্ট ক্যাটাগরি আইডি' });
      }
      const parentExists = await categoriesCollection.findOne({ _id: parentId });
      if (!parentExists) {
        return res.status(404).json({ message: 'নির্ধারিত প্যারেন্ট ক্যাটাগরিটি পাওয়া যায়নি' });
      }
      updates.categoryId = parentId;
    }

    const targetCatId = updates.categoryId || subcategory.categoryId;

    if (name !== undefined) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return res.status(400).json({ message: 'সাব-ক্যাটাগরির নাম ফাঁকা রাখা যাবে না' });
      }
      const duplicate = await subcategoriesCollection.findOne({
        _id: { $ne: subId },
        categoryId: targetCatId,
        name: { $regex: `^${trimmedName}$`, $options: 'i' },
      });
      if (duplicate) {
        return res.status(400).json({ message: 'এই ক্যাটাগরিতে একই নামের সাব-ক্যাটাগরি ইতিমধ্যে রয়েছে' });
      }
      updates.name = trimmedName;
    }

    if (slug !== undefined) {
      const finalSlug = generateSlug(slug.trim());
      const duplicateSlug = await subcategoriesCollection.findOne({
        _id: { $ne: subId },
        slug: { $regex: `^${finalSlug}$`, $options: 'i' },
      });
      if (duplicateSlug) {
        return res.status(400).json({ message: 'একই স্লাগবিশিষ্ট সাব-ক্যাটাগরি ইতিমধ্যে রয়েছে' });
      }
      updates.slug = finalSlug;
    }

    if (description !== undefined) updates.description = String(description).trim();
    if (image !== undefined) updates.image = String(image).trim();
    if (order !== undefined) updates.order = Number(order) || 0;
    if (status !== undefined) updates.status = status === 'inactive' ? 'inactive' : 'active';

    await subcategoriesCollection.updateOne({ _id: subId }, { $set: updates });

    const updatedDoc = await subcategoriesCollection.findOne({ _id: subId });

    return res.status(200).json({
      success: true,
      message: 'সাব-ক্যাটাগরি সফলভাবে আপডেট করা হয়েছে',
      subcategory: updatedDoc,
    });
  } catch (err: any) {
    console.error('Update Subcategory Error:', err);
    return res.status(500).json({ message: 'সাব-ক্যাটাগরি আপডেট করতে সমস্যা হয়েছে' });
  }
};

/**
 * @route   PATCH /api/categories/subcategories/:subId/status
 * @desc    Toggle subcategory status
 * @access  Private (Admin)
 */
export const toggleSubcategoryStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const subId = toObjectId(req.params.subId);
    if (!subId) {
      return res.status(400).json({ message: 'অবৈধ সাব-ক্যাটাগরি আইডি' });
    }

    const { status } = req.body;
    if (status !== 'active' && status !== 'inactive') {
      return res.status(400).json({ message: 'স্ট্যাটাস শুধুমাত্র active অথবা inactive হতে পারে' });
    }

    const result = await subcategoriesCollection.updateOne(
      { _id: subId },
      { $set: { status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'সাব-ক্যাটাগরি খুঁজে পাওয়া যায়নি' });
    }

    return res.status(200).json({
      success: true,
      message: `সাব-ক্যাটাগরি সফলভাবে ${status === 'active' ? 'সক্রিয় (Active)' : 'নিষ্ক্রিয় (Inactive)'} করা হয়েছে`,
      status,
    });
  } catch (err: any) {
    console.error('Toggle Subcategory Status Error:', err);
    return res.status(500).json({ message: 'স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে' });
  }
};

/**
 * @route   DELETE /api/categories/subcategories/:subId
 * @desc    Delete a subcategory safely (checks for linked products)
 * @access  Private (Admin)
 */
export const deleteSubcategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const subId = toObjectId(req.params.subId);
    if (!subId) {
      return res.status(400).json({ message: 'অবৈধ সাব-ক্যাটাগরি আইডি' });
    }

    const subcategory = await subcategoriesCollection.findOne({ _id: subId });
    if (!subcategory) {
      return res.status(404).json({ message: 'সাব-ক্যাটাগরি খুঁজে পাওয়া যায়নি' });
    }

    // Integrity Check: Are there products with this subcategory?
    const linkedProductCount = await productsCollection.countDocuments({
      $or: [
        { subcategoryId: subId },
        { subcategory: subcategory.name },
        { subcategory: subcategory.slug },
      ],
    });

    if (linkedProductCount > 0) {
      return res.status(400).json({
        message: `এই সাব-ক্যাটাগরির অধীনে ${linkedProductCount} টি পণ্য যুক্ত রয়েছে। তাই এটি সরাসরি ডিলিট করা সম্ভব নয়। আপনি চাইলে এটি 'নিষ্ক্রিয় (Inactive)' করতে পারেন।`,
        linkedProductCount,
        canDeactivate: true,
      });
    }

    await subcategoriesCollection.deleteOne({ _id: subId });

    return res.status(200).json({
      success: true,
      message: 'সাব-ক্যাটাগরি সফলভাবে মুছে ফেলা হয়েছে',
    });
  } catch (err: any) {
    console.error('Delete Subcategory Error:', err);
    return res.status(500).json({ message: 'সাব-ক্যাটাগরি ডিলিট করতে সমস্যা হয়েছে' });
  }
};

/**
 * @route   POST /api/categories/reorder
 * @desc    Reorder categories or subcategories
 * @access  Private (Admin)
 */
export const reorderCategories = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { items, type = 'category' } = req.body as {
      items: { id: string; order: number }[];
      type: 'category' | 'subcategory';
    };

    if (!Array.isArray(items)) {
      return res.status(400).json({ message: 'অর্ডারের তালিকা অবৈধ' });
    }

    const collection = type === 'subcategory' ? subcategoriesCollection : categoriesCollection;

    const bulkOps = items.map((item) => ({
      updateOne: {
        filter: { _id: new ObjectId(item.id) },
        update: { $set: { order: Number(item.order), updatedAt: new Date() } },
      },
    }));

    if (bulkOps.length > 0) {
      await collection.bulkWrite(bulkOps);
    }

    return res.status(200).json({
      success: true,
      message: 'ক্রম তালিকা (Sort Order) সফলভাবে হালনাগাদ করা হয়েছে',
    });
  } catch (err: any) {
    console.error('Reorder Error:', err);
    return res.status(500).json({ message: 'ক্রম পরিবর্তন সংরক্ষণ ব্যর্থ হয়েছে' });
  }
};
