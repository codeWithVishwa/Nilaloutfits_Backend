import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Variant from '../models/Variant.js';
import Payment from '../models/Payment.js';
import Cart from '../models/Cart.js';
import { sendOrderInvoiceEmail } from '../utils/invoiceEmail.js';
import { emitOrderUpdate, emitStockUpdate } from '../socket/index.js';

export const createOrder = async (req, res) => {
  try {
    const { items, address, shippingFee = 0, tax = 0, paymentMethod = 'COD', guestEmail } = req.body;
    const isGuestCheckout = !req.user;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Order items are required' });
    }

    const normalizedPaymentMethod = String(paymentMethod || 'COD').toUpperCase();
    const allowedPaymentMethods = ['COD', 'RAZORPAY'];

    if (!allowedPaymentMethods.includes(normalizedPaymentMethod)) {
      return res.status(400).json({ message: 'Invalid payment method' });
    }

    if (!address || typeof address !== 'object') {
      return res.status(400).json({ message: 'Shipping address is required' });
    }

    const requiredAddressFields = ['name', 'phone', 'line1', 'city', 'state', 'postalCode', 'country'];
    const missingFields = requiredAddressFields.filter((field) => !address[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({ message: `Missing address fields: ${missingFields.join(', ')}` });
    }

    if (isGuestCheckout) {
      const normalizedGuestEmail = String(guestEmail || '').trim().toLowerCase();
      if (!normalizedGuestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedGuestEmail)) {
        return res.status(400).json({ message: 'Valid guest email is required' });
      }
    }

    const variantIds = items.map((i) => i.variantId);
    const variants = await Variant.find({ _id: { $in: variantIds } });

    if (variants.length !== items.length) {
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
      await variant.save();
      emitStockUpdate(variant);
    }

    const total = subtotal + shippingFee + tax;

    const order = await Order.create({
      userId: req.user?._id,
      guestInfo: isGuestCheckout
        ? {
          email: String(guestEmail || '').trim().toLowerCase(),
          name: address.name,
          phone: address.phone,
        }
        : undefined,
      items: orderItems,
      address,
      subtotal,
      shippingFee,
      tax,
      total,
      status: 'Created',
      paymentStatus: 'Pending',
      paymentMethod: normalizedPaymentMethod === 'COD' ? 'COD' : 'Razorpay',
    });

    await Payment.create({
      orderId: order._id,
      amount: total,
      status: 'Pending',
      provider: normalizedPaymentMethod === 'COD' ? 'COD' : 'Razorpay',
    });

    if (req.user?._id) {
      await Cart.findOneAndUpdate(
        { userId: req.user._id },
        { $set: { items: [] } }
      );
    }

    emitOrderUpdate(order);

    if (normalizedPaymentMethod === 'COD') {
      sendOrderInvoiceEmail(order._id);
    }

    res.status(201).json(order);

  } catch (error) {
    res.status(400).json({ message: error.message || 'Order creation failed' });
  }
};


export const listOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id })
      .populate('userId', 'name email phone address')
      .populate('items.productId', 'title images brand')
      .populate('items.variantId', 'size color sku price')
      .sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const trackGuestOrder = async (req, res) => {
  try {
    const { orderId, email } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!orderId || !normalizedEmail) {
      return res.status(400).json({ message: 'orderId and email are required' });
    }

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: 'Invalid orderId' });
    }

    const order = await Order.findOne({
      _id: orderId,
      'guestInfo.email': normalizedEmail,
    })
      .populate('items.productId', 'title images brand')
      .populate('items.variantId', 'size color sku price')
      .select('-guestInfo');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    return res.status(200).json(order);
  } catch {
    return res.status(500).json({ message: 'Server error' });
  }
};

export const listAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [
        { paymentMethod: 'COD' },
        { paymentStatus: 'Paid' },
      ],
    })
      .populate('userId', 'name email phone address')
      .populate('items.productId', 'title images brand')
      .populate('items.variantId', 'size color sku price')
      .sort({ createdAt: -1 });
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
