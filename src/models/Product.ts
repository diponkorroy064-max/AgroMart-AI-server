import { ObjectId } from 'mongodb';

export type ProductStatus = 'pending' | 'approved' | 'rejected';

export interface IProduct {
  _id?: ObjectId;
  name: string;
  description: string;
  price: number;
  quantity: number; // Current physical stock
  category: string;
  subcategory?: string;
  categoryId?: ObjectId;
  subcategoryId?: ObjectId;
  image?: string;
  farmerId: ObjectId; // Creator user ID (farmer or seller)
  sellerId?: ObjectId; // Alias for seller creator
  status: ProductStatus;
  createdAt: Date;
  updatedAt?: Date;

  // Inventory Management Fields
  reservedStock?: number; // Stock reserved for active unfulfilled orders (default 0)
  lowStockThreshold?: number; // Alert threshold for low stock (default 5)
  batchNumber?: string; // Agricultural batch/lot (e.g., BATCH-2026-01)
  expiryDate?: Date; // Agricultural product expiry date (for seeds, chemicals, produce)
  mfgDate?: Date; // Production or packaging date
  unit?: string; // e.g., 'কেজি', 'লিটার', 'বস্তা', 'প্যাকেট', 'টি'
  warehouseLocation?: string; // Warehouse/Rack/Shelf identifier
}

