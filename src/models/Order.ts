import { ObjectId } from 'mongodb';

export interface IOrderItem {
  productId: ObjectId;
  name: string;
  price: number;
  quantity: number;
}

export interface IShippingAddress {
  address: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface IOrder {
  _id?: ObjectId;
  userId: ObjectId;
  items: IOrderItem[];
  totalAmount: number;
  shippingAddress: IShippingAddress;
  status: 'pending' | 'shipped' | 'delivered';
  createdAt: Date;
}
