import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Variant from '../models/Variant.js';
import Product from '../models/Product.js';
import Payment from '../models/Payment.js';
import Cart from '../models/Cart.js';
import { emitOrderUpdate, emitStockUpdate } from '../socket/index.js';
import { reserveVariantStock, restoreVariantStock } from '../utils/stock.js';

const toMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const SHIPPING_ENABLED = String(process.env.SHIPPING_ENABLED || 'true').toLowerCase() !== 'false';
const SHIPPING_TAMIL_NADU_FEE = parsePositiveNumber(process.env.SHIPPING_TAMIL_NADU_FEE, 20);
const SHIPPING_OTHER_STATE_FEE = parsePositiveNumber(process.env.SHIPPING_OTHER_STATE_FEE, 50);
const normalizeStateName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
const SHIPPING_TAMIL_NADU_STATE_ALIASES = String(
  process.env.SHIPPING_TAMIL_NADU_STATE_ALIASES || 'tamil nadu,tamilnadu,tn'
)
  .split(',')
  .map((stateName) => normalizeStateName(stateName))
  .filter(Boolean);
const ORDER_TAX_RATE = parsePositiveNumber(process.env.ORDER_TAX_RATE, 0);
const ORDER_CURRENCY = 'INR';
const REQUIRED_ADDRESS_FIELDS = ['name', 'phone', 'line1', 'city', 'state', 'postalCode', 'country'];
const ORDER_REQUEST_ERRORS = new Set([
  'Order items are required',
  'Invalid order items',
  'Invalid variants',
  'Insufficient stock',
]);
const trimInputValue = (value) => (typeof value === 'string' ? value.trim() : value);
const normalizePhoneNumber = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) {
    return digits.slice(2);
  }
  return digits;
};
const formatIndianPhoneNumber = (value) => {
  const digits = normalizePhoneNumber(value);
  return digits ? `+91 ${digits}` : '';
};
const normalizeOrderAddress = (address = {}) => ({
  ...address,
  name: trimInputValue(address.name) || '',
  phone: formatIndianPhoneNumber(address.phone),
  line1: trimInputValue(address.line1) || '',
  line2: trimInputValue(address.line2) || '',
  city: trimInputValue(address.city) || '',
  state: trimInputValue(address.state) || '',
  postalCode: trimInputValue(address.postalCode) || '',
  country: trimInputValue(address.country) || '',
});
const getMissingRequiredAddressFields = (address = {}) =>
  REQUIRED_ADDRESS_FIELDS.filter((field) => !trimInputValue(address[field]));

const computeOrderAmounts = ({ subtotal = 0, address = {}, productShippingFee = 0 }) => {
  const normalizedSubtotal = toMoney(subtotal);
  const normalizedProductShippingFee = toMoney(productShippingFee);

  let baseShippingFee = 0;
  let shippingZone = 'disabled';
  if (SHIPPING_ENABLED) {
    const normalizedState = normalizeStateName(address?.state);
    const isTamilNadu = SHIPPING_TAMIL_NADU_STATE_ALIASES.includes(normalizedState);
    baseShippingFee = isTamilNadu ? SHIPPING_TAMIL_NADU_FEE : SHIPPING_OTHER_STATE_FEE;
    shippingZone = isTamilNadu ? 'tamil_nadu' : 'other_state';
  }
  baseShippingFee = toMoney(baseShippingFee);
  const shippingFee = toMoney(baseShippingFee + normalizedProductShippingFee);

  const tax = toMoney((normalizedSubtotal * ORDER_TAX_RATE) / 100);
  const total = toMoney(normalizedSubtotal + shippingFee + tax);
  const amountForFreeShipping = 0;

  return {
    subtotal: normalizedSubtotal,
    shippingFee,
    tax,
    total,
    currency: ORDER_CURRENCY,
    shippingConfig: {
      enabled: SHIPPING_ENABLED,
      baseFee: baseShippingFee,
      baseShippingFee,
      productShippingFee: normalizedProductShippingFee,
      tamilNaduFee: toMoney(SHIPPING_TAMIL_NADU_FEE),
      otherStateFee: toMoney(SHIPPING_OTHER_STATE_FEE),
      shippingZone,
      freeThreshold: 0,
      remoteSurcharge: 0,
      remoteApplied: false,
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
  const products = await Product.find({ _id: { $in: productIds } }).select('_id shippingCost title').lean();
  const productMetaById = new Map(
    products.map((product) => [
      String(product._id),
      {
        shippingCost: parsePositiveNumber(product.shippingCost, 0),
        title: String(product.title || '').trim(),
      },
    ])
  );

  let subtotal = 0;
  let productShippingFee = 0;
  const chargedProductIds = new Set();
  const orderItems = [];

  for (const [variantId, quantity] of requestedQtyByVariant.entries()) {
    const variant = variantMap.get(variantId);
    if (!variant || Number(variant.stock || 0) < quantity) {
      throw new Error('Insufficient stock');
    }

    const unitPrice = Number(variant.price || 0);
    const productId = String(variant.productId);
    const productMeta = productMetaById.get(productId) || {};
    const unitShippingCost = productMeta.shippingCost || 0;
    subtotal += unitPrice * quantity;
    // Product shipping is charged once per product in an order, not per quantity.
    if (!chargedProductIds.has(productId)) {
      productShippingFee += unitShippingCost;
      chargedProductIds.add(productId);
    }

    orderItems.push({
      productId: variant.productId,
      variantId: variant._id,
      productTitleSnapshot: productMeta.title || undefined,
      variantSkuSnapshot: String(variant.sku || '').trim() || undefined,
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
    const normalizedAddress = normalizeOrderAddress(address);
    const { subtotal, productShippingFee } = await prepareOrderItems(items);
    const amounts = computeOrderAmounts({ subtotal, address: normalizedAddress, productShippingFee });

    return res.status(200).json({
      ...amounts,
      shippingFee: amounts.shippingFee,
      baseShippingFee: amounts.shippingConfig.baseShippingFee,
      productShippingFee: amounts.shippingConfig.productShippingFee,
      shippingZone: amounts.shippingConfig.shippingZone,
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

    const normalizedAddress = normalizeOrderAddress(address);
    const missingFields = getMissingRequiredAddressFields(normalizedAddress);

    if (missingFields.length > 0) {
      return res.status(400).json({ message: `Missing address fields: ${missingFields.join(', ')}` });
    }

    const normalizedPhone = normalizePhoneNumber(normalizedAddress.phone);
    if (normalizedPhone.length !== 10) {
      return res.status(400).json({ message: 'Valid 10-digit mobile number is required' });
    }

    if (isGuestCheckout) {
      const normalizedGuestEmail = String(guestEmail || '').trim().toLowerCase();
      if (!normalizedGuestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedGuestEmail)) {
        return res.status(400).json({ message: 'Valid guest email is required' });
      }
    }

    const { orderItems, subtotal, productShippingFee, requestedQtyByVariant } = await prepareOrderItems(items);
    const amounts = computeOrderAmounts({ subtotal, address: normalizedAddress, productShippingFee });

    const stockReservation = await reserveVariantStock(requestedQtyByVariant);
    let order = null;

    try {
      order = await Order.create({
        userId: req.user?._id,
        guestInfo: isGuestCheckout
          ? {
            email: String(guestEmail || '').trim().toLowerCase(),
            name: normalizedAddress.name,
            phone: normalizedAddress.phone,
          }
          : undefined,
        items: orderItems,
        address: normalizedAddress,
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
    } catch (error) {
      if (order?._id) {
        await Order.findByIdAndDelete(order._id).catch(() => null);
      }

      const rollbackResult = await restoreVariantStock(stockReservation.adjustments).catch(() => null);
      rollbackResult?.updatedVariants?.forEach((variant) => emitStockUpdate(variant));
      throw error;
    }

    stockReservation.updatedVariants.forEach((variant) => emitStockUpdate(variant));

    if (req.user?._id) {
      await Cart.findOneAndUpdate(
        { userId: req.user._id },
        { $set: { items: [] } }
      ).catch(() => null);
    }

    emitOrderUpdate(order);

    res.status(201).json(order);

  } catch (error) {
    const statusCode = ORDER_REQUEST_ERRORS.has(error?.message) ? 400 : 500;
    res.status(statusCode).json({
      message: statusCode === 400 ? error.message : 'Order creation failed',
    });
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
