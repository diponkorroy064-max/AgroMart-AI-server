import { ObjectId } from 'mongodb';

export type CategoryStatus = 'active' | 'inactive';

export interface ICategory {
  _id?: ObjectId;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  status: CategoryStatus;
  order: number;
  productCount?: number;
  subcategoryCount?: number;
  createdAt: Date;
  updatedAt?: Date;
}

export interface ISubcategory {
  _id?: ObjectId;
  categoryId: ObjectId;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  status: CategoryStatus;
  order: number;
  productCount?: number;
  createdAt: Date;
  updatedAt?: Date;
}
