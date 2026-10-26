import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { client } from '../db/db';
import { IBlog, IBlogAuthor } from '../models/Blog';
import { AuthenticatedRequest } from '../types/express';

const blogsCollection = client.db('AgroMart').collection<IBlog>('blogs');

/**
 * Clean slug generator supporting English and Bengali letters
 */
export const toObjectId = (id?: string | string[] | ObjectId): ObjectId | null => {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  const idStr = Array.isArray(id) ? id[0] : String(id);
  return ObjectId.isValid(idStr) ? new ObjectId(idStr) : null;
};

export const generateSlug = (text: string): string => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\u0980-\u09FF-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

/**
 * Seed blogs collection if empty (no-op as initial static blog data is removed)
 */
export const seedBlogsIfEmpty = async () => {
  // Static seed data removed - blogs are managed directly from database
};

/**
 * GET /api/blogs
 * Public: Fetch all published blogs with filters
 */
export const getBlogs = async (req: Request, res: Response) => {
  try {
    const { category, search, limit, featured } = req.query;

    const query: any = { isPublished: true };

    if (category && category !== 'all') {
      query.$or = [
        { categorySlug: category },
        { category: category }
      ];
    }

    if (featured === 'true') {
      query.featured = true;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      const regex = new RegExp(q, 'i');
      query.$or = [
        { title: regex },
        { subtitle: regex },
        { excerpt: regex },
        { category: regex },
        { tags: { $in: [regex] } }
      ];
    }

    let cursor = blogsCollection.find(query).sort({ createdAt: -1 });

    if (limit) {
      const numLimit = parseInt(limit as string, 10);
      if (!isNaN(numLimit) && numLimit > 0) {
        cursor = cursor.limit(numLimit);
      }
    }

    const blogs = await cursor.toArray();

    res.json({
      success: true,
      count: blogs.length,
      data: blogs,
    });
  } catch (error: any) {
    console.error('getBlogs error:', error);
    res.status(500).json({
      success: false,
      message: 'ব্লগ লোড করতে সমস্যা হয়েছে',
      error: error.message,
    });
  }
};

/**
 * GET /api/blogs/slug/:slug
 * Public: Fetch single blog by slug or ID
 */
export const getBlogBySlug = async (req: Request, res: Response) => {
  try {
    const slugParam = req.params.slug;
    const slugStr = Array.isArray(slugParam) ? slugParam[0] : String(slugParam || '');

    let blog = await blogsCollection.findOne({ slug: slugStr });

    const objId = toObjectId(slugStr);
    if (!blog && objId) {
      blog = await blogsCollection.findOne({ _id: objId });
    }

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'ব্লগ পোস্টটি খুঁজে পাওয়া যায়নি',
      });
    }

    res.json({
      success: true,
      data: blog,
    });
  } catch (error: any) {
    console.error('getBlogBySlug error:', error);
    res.status(500).json({
      success: false,
      message: 'ব্লগ বিস্তারিত লোড করতে সমস্যা হয়েছে',
      error: error.message,
    });
  }
};

/**
 * GET /api/blogs/:id
 * Public: Fetch single blog by ObjectId
 */
export const getBlogById = async (req: Request, res: Response) => {
  try {
    const blogId = toObjectId(req.params.id);
    if (!blogId) {
      return res.status(400).json({
        success: false,
        message: 'অবৈধ আইডি ফরম্যাট',
      });
    }

    const blog = await blogsCollection.findOne({ _id: blogId });
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'ব্লগ খুঁজে পাওয়া যায়নি',
      });
    }

    res.json({
      success: true,
      data: blog,
    });
  } catch (error: any) {
    console.error('getBlogById error:', error);
    res.status(500).json({
      success: false,
      message: 'ব্লগ লোড করতে সমস্যা হয়েছে',
      error: error.message,
    });
  }
};

/**
 * GET /api/blogs/admin/all
 * Admin Only: Fetch all blogs including unpublished drafts
 */
export const getAllBlogsAdmin = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { search, category } = req.query;
    const query: any = {};

    if (category && category !== 'all') {
      query.$or = [
        { categorySlug: category },
        { category: category }
      ];
    }

    if (search && typeof search === 'string' && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: regex },
        { excerpt: regex },
        { category: regex },
        { tags: { $in: [regex] } }
      ];
    }

    const blogs = await blogsCollection.find(query).sort({ createdAt: -1 }).toArray();

    res.json({
      success: true,
      count: blogs.length,
      data: blogs,
    });
  } catch (error: any) {
    console.error('getAllBlogsAdmin error:', error);
    res.status(500).json({
      success: false,
      message: 'অ্যাডমিন ব্লগ তালিকা লোড করতে সমস্যা হয়েছে',
      error: error.message,
    });
  }
};

/**
 * POST /api/blogs
 * Admin Only: Create new blog
 */
export const createBlog = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      title,
      slug,
      subtitle,
      category,
      categorySlug,
      readTime,
      date,
      author,
      image,
      excerpt,
      featured,
      tags,
      keyTakeaways,
      sections,
      content,
      isPublished,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'ব্লগের শিরোনাম আবশ্যক',
      });
    }

    if (!category || !category.trim()) {
      return res.status(400).json({
        success: false,
        message: 'ব্লগের ক্যাটাগরি আবশ্যক',
      });
    }

    if (!excerpt || !excerpt.trim()) {
      return res.status(400).json({
        success: false,
        message: 'সংক্ষিপ্ত বিবরণ (Excerpt) প্রদান করা আবশ্যক',
      });
    }

    // Generate unique slug
    let finalSlug = slug ? generateSlug(slug) : generateSlug(title);
    if (!finalSlug) {
      finalSlug = `blog-${Date.now()}`;
    }

    // Check slug uniqueness
    const existing = await blogsCollection.findOne({ slug: finalSlug });
    if (existing) {
      finalSlug = `${finalSlug}-${Date.now().toString().slice(-4)}`;
    }

    // Format author
    const defaultAuthor: IBlogAuthor = {
      name: req.user?.name || 'অ্যাডমিন',
      role: 'অ্যাগ্রোমার্ট কৃষি গবেষণা ও কনটেন্ট টিম',
      avatar: req.user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    };

    const finalAuthor: IBlogAuthor = {
      name: author?.name?.trim() || defaultAuthor.name,
      role: author?.role?.trim() || defaultAuthor.role,
      avatar: author?.avatar?.trim() || defaultAuthor.avatar,
    };

    // Format date in Bengali
    const today = new Date();
    const formattedDate = date || today.toLocaleDateString('bn-BD', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const newBlog: IBlog = {
      title: title.trim(),
      slug: finalSlug,
      subtitle: subtitle?.trim() || '',
      category: category.trim(),
      categorySlug: categorySlug ? generateSlug(categorySlug) : generateSlug(category),
      readTime: readTime?.trim() || '৫ মিনিট পড়া',
      date: formattedDate,
      author: finalAuthor,
      image: image?.trim() || 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80',
      excerpt: excerpt.trim(),
      featured: Boolean(featured),
      tags: Array.isArray(tags) ? tags.map((t: string) => t.trim()).filter(Boolean) : [],
      keyTakeaways: Array.isArray(keyTakeaways) ? keyTakeaways.map((k: string) => k.trim()).filter(Boolean) : [],
      sections: Array.isArray(sections) ? sections : [],
      content: content?.trim() || '',
      isPublished: isPublished !== undefined ? Boolean(isPublished) : true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await blogsCollection.insertOne(newBlog as any);
    newBlog._id = result.insertedId;

    res.status(201).json({
      success: true,
      message: 'ব্লগটি সফলভাবে প্রকাশ ও সংরক্ষণ করা হয়েছে',
      data: newBlog,
    });
  } catch (error: any) {
    console.error('createBlog error:', error);
    res.status(500).json({
      success: false,
      message: 'ব্লগ তৈরি করতে সমস্যা হয়েছে',
      error: error.message,
    });
  }
};

/**
 * PUT /api/blogs/:id
 * Admin Only: Edit existing blog
 */
export const updateBlog = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const blogId = toObjectId(req.params.id);
    if (!blogId) {
      return res.status(400).json({
        success: false,
        message: 'অবৈধ ব্লগ আইডি',
      });
    }

    const existingBlog = await blogsCollection.findOne({ _id: blogId });
    if (!existingBlog) {
      return res.status(404).json({
        success: false,
        message: 'সম্পাদনার জন্য ব্লগটি খুঁজে পাওয়া যায়নি',
      });
    }

    const {
      title,
      slug,
      subtitle,
      category,
      categorySlug,
      readTime,
      date,
      author,
      image,
      excerpt,
      featured,
      tags,
      keyTakeaways,
      sections,
      content,
      isPublished,
    } = req.body;

    const updateFields: any = {
      updatedAt: new Date(),
    };

    if (title !== undefined) updateFields.title = title.trim();
    if (subtitle !== undefined) updateFields.subtitle = subtitle.trim();
    if (category !== undefined) {
      updateFields.category = category.trim();
      updateFields.categorySlug = categorySlug ? generateSlug(categorySlug) : generateSlug(category);
    }
    if (readTime !== undefined) updateFields.readTime = readTime.trim();
    if (date !== undefined) updateFields.date = date;
    if (image !== undefined) updateFields.image = image.trim();
    if (excerpt !== undefined) updateFields.excerpt = excerpt.trim();
    if (featured !== undefined) updateFields.featured = Boolean(featured);
    if (isPublished !== undefined) updateFields.isPublished = Boolean(isPublished);
    if (content !== undefined) updateFields.content = content.trim();

    if (author) {
      updateFields.author = {
        name: author.name ? author.name.trim() : existingBlog.author.name,
        role: author.role ? author.role.trim() : existingBlog.author.role,
        avatar: author.avatar ? author.avatar.trim() : existingBlog.author.avatar,
      };
    }

    if (Array.isArray(tags)) {
      updateFields.tags = tags.map((t: string) => t.trim()).filter(Boolean);
    }
    if (Array.isArray(keyTakeaways)) {
      updateFields.keyTakeaways = keyTakeaways.map((k: string) => k.trim()).filter(Boolean);
    }
    if (Array.isArray(sections)) {
      updateFields.sections = sections;
    }

    if (slug && slug.trim() && slug !== existingBlog.slug) {
      const candidateSlug = generateSlug(slug);
      const duplicate = await blogsCollection.findOne({
        slug: candidateSlug,
        _id: { $ne: blogId },
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: 'এই স্লাগ (Slug) ইতিমধ্যে ব্যবহৃত হয়েছে, অন্য স্লাগ প্রদান করুন',
        });
      }
      updateFields.slug = candidateSlug;
    }

    await blogsCollection.updateOne({ _id: blogId }, { $set: updateFields });

    const updatedBlog = await blogsCollection.findOne({ _id: blogId });

    res.json({
      success: true,
      message: 'ব্লগ সফলভাবে আপডেট করা হয়েছে',
      data: updatedBlog,
    });
  } catch (error: any) {
    console.error('updateBlog error:', error);
    res.status(500).json({
      success: false,
      message: 'ব্লগ আপডেট করতে সমস্যা হয়েছে',
      error: error.message,
    });
  }
};

/**
 * DELETE /api/blogs/:id
 * Admin Only: Delete blog
 */
export const deleteBlog = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const blogId = toObjectId(req.params.id);
    if (!blogId) {
      return res.status(400).json({
        success: false,
        message: 'অবৈধ ব্লগ আইডি',
      });
    }

    const existingBlog = await blogsCollection.findOne({ _id: blogId });
    if (!existingBlog) {
      return res.status(404).json({
        success: false,
        message: 'মুছে ফেলার জন্য ব্লগটি খুঁজে পাওয়া যায়নি',
      });
    }

    await blogsCollection.deleteOne({ _id: blogId });

    res.json({
      success: true,
      message: `"${existingBlog.title}" ব্লগটি সফলভাবে মুছে ফেলা হয়েছে`,
    });
  } catch (error: any) {
    console.error('deleteBlog error:', error);
    res.status(500).json({
      success: false,
      message: 'ব্লগ মুছতে সমস্যা হয়েছে',
      error: error.message,
    });
  }
};

/**
 * POST /api/blogs/upload
 * Admin Only: Upload blog cover image (PNG, JPG, WEBP, GIF)
 */
export const uploadBlogImage = async (req: any, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'কোনো ইমেজ ফাইল পাওয়া যায়নি',
      });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    return res.status(200).json({
      success: true,
      message: 'ছবি সফলভাবে আপলোড হয়েছে',
      image: fileUrl,
      url: fileUrl,
    });
  } catch (error: any) {
    console.error('uploadBlogImage error:', error);
    return res.status(500).json({
      success: false,
      message: 'ছবি আপলোড করতে সমস্যা হয়েছে',
      error: error.message,
    });
  }
};
