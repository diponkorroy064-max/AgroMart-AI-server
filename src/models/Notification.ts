import { ObjectId } from 'mongodb';

export type NotificationType =
  | 'order_status'
  | 'order_created'
  | 'order_cancelled'
  | 'order_shipped'
  | 'order_delivered'
  | 'return_requested'
  | 'return_processed'
  | 'system';

export interface INotification {
  _id?: ObjectId;
  userId: ObjectId;
  title: string;
  message: string;
  type: NotificationType;
  orderId?: ObjectId;
  orderNumber?: string;
  shipmentId?: string;
  isRead: boolean;
  link?: string;
  createdAt: Date;
}
