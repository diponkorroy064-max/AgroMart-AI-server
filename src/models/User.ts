import { ObjectId } from "mongodb";

export interface IUser {
  _id?: ObjectId;
  name: string;
  email: string;
  password?: string;
  role: "farmer" | "seller" | "admin";
  phone?: string;
  address?: string;
  avatar?: string;
  documentPdf?: string;
  documentName?: string;
  bio?: string;
  createdAt: Date;
  updatedAt?: Date;
}
