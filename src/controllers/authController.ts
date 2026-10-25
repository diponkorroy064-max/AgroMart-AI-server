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
        { expiresIn: "30d" }
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
      { expiresIn: "30d" }
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

export const updateProfile = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const userId = new ObjectId(req.user._id);
    const {
      name,
      email,
      phone,
      address,
      avatar,
      documentPdf,
      documentName,
      bio,
      currentPassword,
      newPassword,
    } = req.body;

    const existingUser = await usersCollection.findOne({ _id: userId });
    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const updateFields: Partial<IUser> = {
      updatedAt: new Date(),
    };

    // If updating name
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }
      updateFields.name = name.trim();
    }

    // If updating email
    if (email !== undefined && email !== existingUser.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }
      const emailTaken = await usersCollection.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: userId },
      });
      if (emailTaken) {
        return res.status(400).json({ message: "Email is already in use by another account" });
      }
      updateFields.email = email.toLowerCase().trim();
    }

    // Optional profile fields
    if (phone !== undefined) updateFields.phone = typeof phone === "string" ? phone.trim() : "";
    if (address !== undefined) updateFields.address = typeof address === "string" ? address.trim() : "";
    if (avatar !== undefined) updateFields.avatar = typeof avatar === "string" ? avatar.trim() : "";
    if (documentPdf !== undefined) updateFields.documentPdf = typeof documentPdf === "string" ? documentPdf.trim() : "";
    if (documentName !== undefined) updateFields.documentName = typeof documentName === "string" ? documentName.trim() : "";
    if (bio !== undefined) updateFields.bio = typeof bio === "string" ? bio.trim() : "";

    // Optional password change
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: "Current password is required to set a new password" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }
      const isMatch = await bcrypt.compare(currentPassword, existingUser.password as string);
      if (!isMatch) {
        return res.status(400).json({ message: "Current password does not match" });
      }
      const salt = await bcrypt.genSalt(10);
      updateFields.password = await bcrypt.hash(newPassword, salt);
    }

    await usersCollection.updateOne({ _id: userId }, { $set: updateFields });

    const updatedUser = await usersCollection.findOne({ _id: userId });
    if (!updatedUser) {
      return res.status(500).json({ message: "Failed to retrieve updated profile" });
    }

    const { password, ...userWithoutPassword } = updatedUser;

    return res.status(200).json({
      message: "Profile updated successfully",
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return res.status(500).json({ message: "Server error updating profile" });
  }
};

export const uploadFile = (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: "কোনো ফাইল নির্বাচন করা হয়নি" });
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  return res.status(200).json({
    url: fileUrl,
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });
};



