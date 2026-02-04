import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Variant from '../models/Variant.js';
import Payment from '../models/Payment.js';
import { emitOrderUpdate, emitStockUpdate } from '../socket/index.js';

export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { items, address, shippingFee = 0, tax = 0 } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Order items are required' });
    }

    const variantIds = items.map((i) => i.variantId);
    const variants = await Variant.find({ _id: { $in: variantIds } }).session(session);

    if (variants.length !== items.length) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid variants' });
    }

    let subtotal = 0;
    const orderItems = items.map((item) => {
      const variant = variants.find((v) => v._id.toString() === item.variantId);
      if (!variant || variant.stock < item.quantity) {
        throw new Error('Insufficient stock');
      }
      subtotal += variant.price * item.quantity;
      return {
        productId: variant.productId,
        variantId: variant._id,
        quantity: item.quantity,
        priceSnapshot: variant.price,
      };
    });

    for (const item of orderItems) {
      const variant = variants.find((v) => v._id.toString() === item.variantId.toString());
      variant.stock -= item.quantity;
      variant.availability = variant.stock > 0 ? 'InStock' : 'OutOfStock';
      await variant.save({ session });
      emitStockUpdate(variant);
    }

    const total = subtotal + shippingFee + tax;

    const order = await Order.create([
      {
        userId: req.user._id,
        items: orderItems,
        address,
        subtotal,
        shippingFee,
        tax,
        total,
        status: 'Created',
        paymentStatus: 'Pending',
      },
    ], { session });

    await Payment.create([
      {
        orderId: order[0]._id,
        amount: total,
        status: 'Pending',
      },
    ], { session });

    await session.commitTransaction();
    emitOrderUpdate(order[0]);
    res.status(201).json(order[0]);
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message || 'Order creation failed' });
  } finally {
    session.endSession();
  }
};

export const listOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const listAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(id, { status }, { new: true });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    emitOrderUpdate(order);
    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
