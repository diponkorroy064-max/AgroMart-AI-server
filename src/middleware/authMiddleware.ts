import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { client } from "../db/db";
import { IUser } from "../models/User";
import { AuthenticatedRequest } from "../types/express";

const usersCollection = client.db("AgroMart").collection<IUser>("users");

export const protect = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  let token: string | undefined;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      if (!token) {
        return res.status(401).json({
          message: "টোকেন পাওয়া যায়নি",
        });
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string
      ) as any;

      const userId = decoded?.id || decoded?._id;

      if (!userId || !ObjectId.isValid(userId)) {
        return res.status(401).json({
          message: "অবৈধ টোকেন ফরম্যাট",
        });
      }

      const user = await usersCollection.findOne({
        _id: new ObjectId(userId),
      });

      if (!user) {
        return res.status(401).json({
          message: "ব্যবহারকারী খুঁজে পাওয়া যায়নি",
        });
      }

      req.user = user;

      return next();
    } catch (error: any) {
      console.error("Auth Middleware Error:", error?.name, error?.message);
      if (error?.name === "TokenExpiredError") {
        return res.status(401).json({
          message: "টোকেনের মেয়াদ শেষ হয়ে গেছে, অনুগ্রহ করে পুনরায় লগইন করুন",
          isExpired: true,
        });
      }
      return res.status(401).json({
        message: "অননুমোদিত অ্যাক্সেস (Not authorized)",
      });
    }
  }

  return res.status(401).json({
    message: "লগইন করা আবশ্যক (No token)",
  });
};
