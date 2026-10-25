import { ObjectId } from "mongodb";

export interface IFavorite {
  _id?: ObjectId;
  userId: ObjectId;
  productId: ObjectId;
  createdAt: Date;
}
