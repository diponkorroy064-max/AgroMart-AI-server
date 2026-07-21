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

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string
      ) as { id: string };

      const user = await usersCollection.findOne({
        _id: new ObjectId(decoded.id),
      });

      if (!user) {
        return res.status(401).json({
          message: "User not found",
        });
      }

      req.user = user;

      return next();
    } catch (error) {
      return res.status(401).json({
        message: "Not authorized",
      });
    }
  }

  return res.status(401).json({
    message: "No token",
  });
};
