import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Variant from '../models/Variant.js';
import Product from '../models/Product.js';
import Payment from '../models/Payment.js';
import Cart from '../models/Cart.js';
import { emitOrderUpdate, emitStockUpdate } from '../socket/index.js';

const toMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const SHIPPING_ENABLED = String(process.env.SHIPPING_ENABLED || 'true').toLowerCase() !== 'false';
const SHIPPING_BASE_FEE = parsePositiveNumber(process.env.SHIPPING_BASE_FEE, 80);
const SHIPPING_FREE_THRESHOLD = parsePositiveNumber(process.env.SHIPPING_FREE_THRESHOLD, 1499);
const SHIPPING_REMOTE_SURCHARGE = parsePositiveNumber(process.env.SHIPPING_REMOTE_SURCHARGE, 0);
const SHIPPING_REMOTE_POSTAL_PREFIXES = String(process.env.SHIPPING_REMOTE_POSTAL_PREFIXES || '')
  .split(',')
  .map((prefix) => prefix.trim())
  .filter(Boolean);
const ORDER_TAX_RATE = parsePositiveNumber(process.env.ORDER_TAX_RATE, 0);
const ORDER_CURRENCY = 'INR';

const isRemotePostalCode = (postalCode) => {
  const normalizedPostalCode = String(postalCode || '').trim();
  if (!normalizedPostalCode || SHIPPING_REMOTE_POSTAL_PREFIXES.length === 0) return false;
  return SHIPPING_REMOTE_POSTAL_PREFIXES.some((prefix) => normalizedPostalCode.startsWith(prefix));
};

const computeOrderAmounts = ({ subtotal = 0, address = {}, productShippingFee = 0 }) => {
  const normalizedSubtotal = toMoney(subtotal);
  const normalizedProductShippingFee = toMoney(productShippingFee);

  let baseShippingFee = 0;
  if (SHIPPING_ENABLED) {
    const qualifiesForFreeShipping =
      SHIPPING_FREE_THRESHOLD > 0 && normalizedSubtotal >= SHIPPING_FREE_THRESHOLD;
    baseShippingFee = qualifiesForFreeShipping ? 0 : SHIPPING_BASE_FEE;

    if (baseShippingFee > 0 && SHIPPING_REMOTE_SURCHARGE > 0 && isRemotePostalCode(address?.postalCode)) {
      baseShippingFee += SHIPPING_REMOTE_SURCHARGE;
    }
  }
  baseShippingFee = toMoney(baseShippingFee);
  const shippingFee = toMoney(baseShippingFee + normalizedProductShippingFee);

  const tax = toMoney((normalizedSubtotal * ORDER_TAX_RATE) / 100);
  const total = toMoney(normalizedSubtotal + shippingFee + tax);
  const amountForFreeShipping = SHIPPING_FREE_THRESHOLD > 0
    ? toMoney(Math.max(0, SHIPPING_FREE_THRESHOLD - normalizedSubtotal))
    : 0;

  return {
    subtotal: normalizedSubtotal,
    shippingFee,
    tax,
    total,
    currency: ORDER_CURRENCY,
    shippingConfig: {
      enabled: SHIPPING_ENABLED,
      baseFee: toMoney(SHIPPING_BASE_FEE),
      baseShippingFee,
      productShippingFee: normalizedProductShippingFee,
      freeThreshold: SHIPPING_FREE_THRESHOLD > 0 ? toMoney(SHIPPING_FREE_THRESHOLD) : 0,
      remoteSurcharge: toMoney(SHIPPING_REMOTE_SURCHARGE),
      remoteApplied: baseShippingFee > 0 && SHIPPING_REMOTE_SURCHARGE > 0 && isRemotePostalCode(address?.postalCode),
      isFreeShipping: shippingFee === 0,
      amountForFreeShipping,
    },
  };
};

const prepareOrderItems = async (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Order items are required');
  }

  const requestedQtyByVariant = new Map();
  for (const item of items) {
    const variantId = String(item?.variantId || '').trim();
    const quantity = Number(item?.quantity || 0);
    const normalizedQty = Number.isInteger(quantity) ? quantity : Math.floor(quantity);

    if (!variantId || !Number.isInteger(normalizedQty) || normalizedQty <= 0) {
      throw new Error('Invalid order items');
    }

    requestedQtyByVariant.set(variantId, (requestedQtyByVariant.get(variantId) || 0) + normalizedQty);
  }

  const variantIds = [...requestedQtyByVariant.keys()];
  const variants = await Variant.find({ _id: { $in: variantIds } });
  const variantMap = new Map(variants.map((variant) => [String(variant._id), variant]));

  if (variants.length !== variantIds.length) {
    throw new Error('Invalid variants');
  }

  const productIds = [...new Set(variants.map((variant) => String(variant.productId)))];
  const products = await Product.find({ _id: { $in: productIds } }).select('_id shippingCost').lean();
  const productShippingCostById = new Map(
    products.map((product) => [String(product._id), parsePositiveNumber(product.shippingCost, 0)])
  );

  let subtotal = 0;
  let productShippingFee = 0;
  const orderItems = [];

  for (const [variantId, quantity] of requestedQtyByVariant.entries()) {
    const variant = variantMap.get(variantId);
    if (!variant || Number(variant.stock || 0) < quantity) {
      throw new Error('Insufficient stock');
    }

    const unitPrice = Number(variant.price || 0);
    const productId = String(variant.productId);
    const unitShippingCost = productShippingCostById.get(productId) || 0;
    subtotal += unitPrice * quantity;
    productShippingFee += unitShippingCost * quantity;

    orderItems.push({
      productId: variant.productId,
      variantId: variant._id,
      quantity,
      priceSnapshot: unitPrice,
    });
  }

  return {
    orderItems,
    subtotal: toMoney(subtotal),
    productShippingFee: toMoney(productShippingFee),
    variantMap,
    requestedQtyByVariant,
  };
};

export const quoteOrderPricing = async (req, res) => {
  try {
    const { items = [], address = {} } = req.body || {};
    const { subtotal, productShippingFee } = await prepareOrderItems(items);
    const amounts = computeOrderAmounts({ subtotal, address, productShippingFee });

    return res.status(200).json({
      ...amounts,
      shippingFee: amounts.shippingFee,
      baseShippingFee: amounts.shippingConfig.baseShippingFee,
      productShippingFee: amounts.shippingConfig.productShippingFee,
      isFreeShipping: amounts.shippingConfig.isFreeShipping,
      freeShippingThreshold: amounts.shippingConfig.freeThreshold,
      amountForFreeShipping: amounts.shippingConfig.amountForFreeShipping,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to calculate shipping quote' });
  }
};

export const createOrder = async (req, res) => {
  try {
    const { items, address, paymentMethod = 'Razorpay', guestEmail } = req.body;
    const isGuestCheckout = !req.user;

    const normalizedPaymentMethod = String(paymentMethod || 'Razorpay').toUpperCase();
    const allowedPaymentMethods = ['RAZORPAY'];

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

    const { orderItems, subtotal, productShippingFee, variantMap, requestedQtyByVariant } = await prepareOrderItems(items);
    const amounts = computeOrderAmounts({ subtotal, address, productShippingFee });

    for (const [variantId, quantity] of requestedQtyByVariant.entries()) {
      const variant = variantMap.get(variantId);
      if (!variant) continue;
      variant.stock = Number(variant.stock || 0) - quantity;
      variant.availability = variant.stock > 0 ? 'InStock' : 'OutOfStock';
      await variant.save();
      emitStockUpdate(variant);
    }

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
      subtotal: amounts.subtotal,
      shippingFee: amounts.shippingFee,
      tax: amounts.tax,
      total: amounts.total,
      status: 'Created',
      paymentStatus: 'Pending',
      paymentMethod: 'Razorpay',
    });

    await Payment.create({
      orderId: order._id,
      amount: amounts.total,
      status: 'Pending',
      provider: 'Razorpay',
    });

    if (req.user?._id) {
      await Cart.findOneAndUpdate(
        { userId: req.user._id },
        { $set: { items: [] } }
      );
    }

    emitOrderUpdate(order);

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
    const orders = await Order.find({ paymentStatus: 'Paid' })
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
