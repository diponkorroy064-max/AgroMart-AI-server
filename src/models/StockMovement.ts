import { ObjectId } from "mongodb";

export type StockMovementType =
  | "initial"
  | "restock"         // নতুন স্টক যোগ
  | "adjustment"      // ম্যানুয়াল স্টক সমন্বয় (+ বা -)
  | "order_placed"    // অর্ডারের কারণে স্টক কাটা/রিজার্ভ
  | "order_cancelled" // অর্ডার বাতিলের কারণে স্টক ফেরত
  | "damaged"         // নষ্ট বা ক্ষতিগ্রস্থ স্টক বাদ
  | "expired";        // মেয়াদোত্তীর্ণ স্টক বাতিল

export interface IStockMovement {
  _id?: ObjectId;
  productId: ObjectId;
  productName: string;
  sellerId: ObjectId;
  sellerName?: string;
  type: StockMovementType;
  quantityChange: number; // e.g. +50 or -5
  previousStock: number;
  newStock: number;
  batchNumber?: string;
  reason?: string;
  orderId?: ObjectId;
  orderNumber?: string;
  performedBy: {
    userId: ObjectId;
    name: string;
    role: "seller" | "admin" | "farmer" | "system";
  };
  createdAt: Date;
}
