import { ObjectId } from 'mongodb';

export interface IOrderItem {
  productId: ObjectId;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  sellerId?: ObjectId;
}

export interface IShippingAddress {
  name?: string;
  phone?: string;
  district?: string;
  address: string;
  city?: string;
  postalCode?: string;
  country?: string;
  note?: string;
}

export interface IOrder {
  _id?: ObjectId;
  orderNumber?: string;
  userId: ObjectId;
  customerName?: string;
  customerPhone?: string;
  items: IOrderItem[];
  subtotal?: number;
  deliveryFee?: number;
  totalAmount: number;
  shippingAddress: IShippingAddress;
  paymentMethod: 'cod' | 'bkash' | 'online';
  paymentStatus: 'unpaid' | 'paid';
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: Date;
  updatedAt?: Date;
}
