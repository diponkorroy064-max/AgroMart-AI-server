import { Response } from "express";
import { ObjectId } from "mongodb";
import { client } from "../db/db";
import { IFavorite } from "../models/Favorite";
import { IProduct } from "../models/Product";
import { AuthenticatedRequest } from "../types/express";

const favoritesCollection = client.db("AgroMart").collection<IFavorite>("favorites");
const productsCollection = client.db("AgroMart").collection<IProduct>("products");

// Toggle favorite: adds if not present, removes if already present
export const toggleFavorite = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const productId = String(req.params.productId || "");
    if (!productId || !ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "সঠিক পণ্য আইডি প্রদান করুন" });
    }

    const productObjectId = new ObjectId(productId);
    const userObjectId = new ObjectId(String(userId));

    // Verify product exists
    const product = await productsCollection.findOne({ _id: productObjectId });
    if (!product) {
      return res.status(404).json({ message: "পণ্যটি খুঁজে পাওয়া যায়নি" });
    }

    const existing = await favoritesCollection.findOne({
      userId: userObjectId,
      productId: productObjectId,
    });

    if (existing) {
      await favoritesCollection.deleteOne({
        userId: userObjectId,
        productId: productObjectId,
      });

      return res.status(200).json({
        success: true,
        isFavorite: false,
        message: "পছন্দের তালিকা থেকে সরানো হয়েছে",
      });
    } else {
      await favoritesCollection.insertOne({
        userId: userObjectId,
        productId: productObjectId,
        createdAt: new Date(),
      });

      return res.status(200).json({
        success: true,
        isFavorite: true,
        message: "পছন্দের তালিকায় যোগ করা হয়েছে",
      });
    }
  } catch (error) {
    console.error("Toggle favorite error:", error);
    return res.status(500).json({ message: "সার্ভার ত্রুটি ঘটেছে" });
  }
};

// Check if a specific product is in user's favorites
export const checkFavorite = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(200).json({ isFavorite: false });
    }

    const productId = String(req.params.productId || "");
    if (!productId || !ObjectId.isValid(productId)) {
      return res.status(200).json({ isFavorite: false });
    }

    const existing = await favoritesCollection.findOne({
      userId: new ObjectId(String(userId)),
      productId: new ObjectId(productId),
    });

    return res.status(200).json({ isFavorite: !!existing });
  } catch (error) {
    console.error("Check favorite error:", error);
    return res.status(500).json({ message: "সার্ভার ত্রুটি ঘটেছে", isFavorite: false });
  }
};

// Get all favorite products for the logged in user
export const getMyFavorites = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const favorites = await favoritesCollection
      .aggregate([
        {
          $match: {
            userId: new ObjectId(String(userId)),
          },
        },
        {
          $sort: {
            createdAt: -1,
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "productId",
            foreignField: "_id",
            as: "product",
          },
        },
        {
          $unwind: "$product",
        },
        {
          $replaceRoot: {
            newRoot: {
              $mergeObjects: [
                "$product",
                {
                  favoriteId: "$_id",
                  favoritedAt: "$createdAt",
                },
              ],
            },
          },
        },
      ])
      .toArray();

    return res.status(200).json({
      success: true,
      favorites,
    });
  } catch (error) {
    console.error("Get favorites error:", error);
    return res.status(500).json({ message: "সার্ভার ত্রুটি ঘটেছে" });
  }
};

// Delete from favorites
export const removeFavorite = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "লগইন করা আবশ্যক" });
    }

    const productId = String(req.params.productId || "");
    if (!productId || !ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "সঠিক পণ্য আইডি প্রদান করুন" });
    }

    await favoritesCollection.deleteOne({
      userId: new ObjectId(String(userId)),
      productId: new ObjectId(productId),
    });

    return res.status(200).json({
      success: true,
      isFavorite: false,
      message: "পছন্দের তালিকা থেকে সরানো হয়েছে",
    });
  } catch (error) {
    console.error("Remove favorite error:", error);
    return res.status(500).json({ message: "সার্ভার ত্রুটি ঘটেছে" });
  }
};
