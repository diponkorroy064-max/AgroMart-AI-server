import { ObjectId } from "mongodb";

export interface IUser {
  _id?: ObjectId;
  name: string;
  email: string;
  password?: string;
  role: "farmer" | "seller" | "admin";
  createdAt: Date;
}
