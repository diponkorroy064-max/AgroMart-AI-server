import { Response } from 'express';
import { client } from '../db/db';
import { IOrder, IOrderItem, IShippingAddress } from '../models/Order';
import { IProduct } from '../models/Product';
import { ObjectId } from 'mongodb';
import { AuthenticatedRequest } from '../types/express';

const ordersCollection = client.db("AgroMart").collection<IOrder>('orders');
const productsCollection = client.db("AgroMart").collection<IProduct>('products');

export const createOrder = async (req: AuthenticatedRequest, res: Response) => {
  const { items, shippingAddress, totalAmount } = req.body as { items: IOrderItem[], shippingAddress: IShippingAddress, totalAmount: number };
  const userId = new ObjectId(req.user?._id);

  if (!items || items.length === 0 || !shippingAddress || !totalAmount) {
    return res.status(400).json({ message: 'Missing required order information' });
  }

  try {
    // In a real application, you would also want to verify the prices on the server-side
    // and handle inventory updates.

    const newOrder: IOrder = {
      userId,
      items,
      totalAmount,
      shippingAddress,
      status: 'pending',
      createdAt: new Date(),
    };

    const result = await ordersCollection.insertOne(newOrder);
    res.status(201).json({ message: 'Order created successfully', orderId: result.insertedId });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getMyOrders = async (req: AuthenticatedRequest, res: Response) => {
  const userId = new ObjectId(req.user?._id);

  try {
    const orders = await ordersCollection.find({ userId }).sort({ createdAt: -1 }).toArray();
    res.status(200).json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getSellerOrders = async (req: AuthenticatedRequest, res: Response) => {
  const sellerId = new ObjectId(req.user?._id);

  try {
    // Find all products belonging to the seller
    const sellerProducts = await productsCollection.find({ farmerId: sellerId }).project({ _id: 1 }).toArray();
    const sellerProductIds = sellerProducts.map(p => p._id);

    // Find all orders that contain at least one of the seller's products
    const orders = await ordersCollection.find({
      'items.productId': { $in: sellerProductIds }
    }).sort({ createdAt: -1 }).toArray();

    // Filter the items in each order to only include the seller's products
    const sellerOrders = orders.map(order => ({
      ...order,
      items: order.items.filter(item => sellerProductIds.some(id => id.equals(item.productId)))
    }));

    res.status(200).json(sellerOrders);
  } catch (error) {
    console.error('Error fetching seller orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateOrderStatus = async (req: AuthenticatedRequest, res: Response) => {
  const { orderId } = req.params;
  const { status } = req.body as { status: 'pending' | 'shipped' | 'delivered' };
  const sellerId = new ObjectId(req.user?._id);

  if (!status || !['pending', 'shipped', 'delivered'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    const order = await ordersCollection.findOne({ _id: new ObjectId(String(orderId)) });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if the seller has any product in this order
    const sellerProducts = await productsCollection.find({ farmerId: sellerId }).project({ _id: 1 }).toArray();
    const sellerProductIds = sellerProducts.map(p => p._id);

    const isSellerOrder = order.items.some(item => sellerProductIds.some(id => id.equals(item.productId)));

    if (!isSellerOrder) {
      return res.status(403).json({ message: 'Not authorized to update this order' });
    }

    await ordersCollection.updateOne(
      { _id: new ObjectId(String(orderId))},
      { $set: { status: status } }
    );

    res.status(200).json({ message: 'Order status updated successfully' });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
