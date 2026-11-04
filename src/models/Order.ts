import { ObjectId } from 'mongodb';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'PACKED'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'DELIVERY_FAILED'
  | 'RETURN_REQUESTED'
  | 'RETURNED'
  // Backward compatibility with previous lowercase statuses
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'packed'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'delivery_failed'
  | 'return_requested'
  | 'returned';

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

export interface IOrderStatusHistory {
  status: OrderStatus;
  timestamp: Date;
  note?: string;
  courierName?: string;
  trackingNumber?: string;
  estimatedDeliveryDate?: Date | string;
  updatedBy?: {
    userId?: ObjectId;
    name?: string;
    role?: string;
  };
}

export interface ISellerShipment {
  shipmentId: string;
  sellerId: ObjectId;
  sellerName?: string;
  items: IOrderItem[];
  subtotal?: number;
  status: OrderStatus;
  courierName?: string;
  trackingNumber?: string;
  estimatedDeliveryDate?: Date | string;
  statusHistory: IOrderStatusHistory[];
  cancellationReason?: string;
  returnReason?: string;
  stockRestored?: boolean;
  updatedAt?: Date;
}

export interface IOrder {
  _id?: ObjectId;
  orderNumber?: string;
  userId: ObjectId;
  customerName?: string;
  customerPhone?: string;
  items: IOrderItem[];
  shipments?: ISellerShipment[];
  subtotal?: number;
  deliveryFee?: number;
  totalAmount: number;
  shippingAddress: IShippingAddress;
  paymentMethod: 'cod' | 'bkash' | 'online';
  paymentStatus: 'unpaid' | 'paid' | 'refunded';
  status: OrderStatus;
  courierName?: string;
  trackingNumber?: string;
  estimatedDeliveryDate?: Date | string;
  statusHistory?: IOrderStatusHistory[];
  cancellationReason?: string;
  returnReason?: string;
  stockRestored?: boolean;
  createdAt: Date;
  updatedAt?: Date;
}
