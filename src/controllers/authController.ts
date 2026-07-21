import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { client } from "../db/db";
import { IUser } from "../models/User";
import { ObjectId } from "mongodb";
import { AuthenticatedRequest } from "../types/express";

const usersCollection = client.db("AgroMart").collection<IUser>("users");

export const register = async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (role !== "farmer" && role !== "seller") {
    return res.status(400).json({ message: "Invalid role" });
  }

  try {
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser: IUser = {
      name,
      email,
      password: hashedPassword,
      role,
      createdAt: new Date(),
    };

    const result = await usersCollection.insertOne(newUser);
    const insertedUser = await usersCollection.findOne({ _id: result.insertedId });


    if (insertedUser) {
      const token = jwt.sign(
        { id: insertedUser._id, role: insertedUser.role },
        process.env.JWT_SECRET as string,
        { expiresIn: "1h" }
      );
      const { password, ...user } = insertedUser;

      res.status(201).json({ token, user });
    } else {
      res.status(500).json({ message: "Failed to retrieve new user" });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password as string);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "1h" }
    );

    const { password: userPassword, ...userInfo } = user;

    res.status(200).json({ token, user: userInfo });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};


export const getMe = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const user = await usersCollection.findOne({
      _id: new ObjectId(req.user!._id),
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const { password, ...userInfo } = user;

    res.status(200).json(userInfo);
  } catch {
    res.status(500).json({
      message: "Server error",
    });
  }
};

