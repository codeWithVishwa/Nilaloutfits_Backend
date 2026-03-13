import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Order from '../src/models/Order.js';
import Payment from '../src/models/Payment.js';
import Variant from '../src/models/Variant.js';
import User from '../src/models/User.js';
import { ORDER_STATUS } from '../src/config/constants.js';

dotenv.config();

const TARGET_ORDERS = Number(process.env.SEED_PREVIEW_ORDER_COUNT || 24);
const MAX_ITEMS_PER_ORDER = Number(process.env.SEED_PREVIEW_MAX_ITEMS || 3);
const GUEST_RATIO = Number(process.env.SEED_PREVIEW_GUEST_RATIO || 0.45);
const DAYS_BACK = Number(process.env.SEED_PREVIEW_DAYS_BACK || 7);
const MARKER = process.env.SEED_PREVIEW_MARKER || '[preview-order]';

const STREET_NAMES = [
  'Market Road',
  'Temple Street',
  'Lake View Road',
  'MG Road',
  'Garden Avenue',
  'Station Road',
  'Nehru Street',
];

const CITIES = [
  { city: 'Chennai', state: 'Tamil Nadu', postalPrefix: '600' },
  { city: 'Coimbatore', state: 'Tamil Nadu', postalPrefix: '641' },
  { city: 'Madurai', state: 'Tamil Nadu', postalPrefix: '625' },
  { city: 'Bengaluru', state: 'Karnataka', postalPrefix: '560' },
  { city: 'Kochi', state: 'Kerala', postalPrefix: '682' },
];

const GUEST_FIRST_NAMES = ['Asha', 'Kavin', 'Meera', 'Rahul', 'Divya', 'Arjun', 'Nila', 'Surya', 'Priya'];
const GUEST_LAST_NAMES = ['Kumar', 'Raman', 'Iyer', 'Sharma', 'Nair', 'Reddy', 'Balan', 'Krishnan', 'Singh'];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomChoice = (arr) => arr[randomInt(0, arr.length - 1)];
const asMoney = (value) => Number(value.toFixed(2));

const shuffle = (arr) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const randomDateInPast = (daysBack) => {
  const now = Date.now();
  const maxOffset = Math.max(0, Math.floor(daysBack)) * 24 * 60 * 60 * 1000;
  const offset = randomInt(0, maxOffset);
  return new Date(now - offset);
};

const randomPhone = () => `9${randomInt(100000000, 999999999)}`;

const buildGuestIdentity = (index) => {
  const first = randomChoice(GUEST_FIRST_NAMES);
  const last = randomChoice(GUEST_LAST_NAMES);
  const safeLast = last.toLowerCase();
  const seq = String(index + 1).padStart(3, '0');
  return {
    name: `${first} ${last}`,
    email: `preview.guest.${seq}.${safeLast}@example.com`,
    phone: randomPhone(),
  };
};

const buildAddress = ({ name, phone, baseAddress }) => {
  const cityMeta = randomChoice(CITIES);
  const houseNumber = randomInt(4, 144);
  const baseLine2 = baseAddress?.line2 ? String(baseAddress.line2).trim() : '';

  return {
    name: name || baseAddress?.name || 'Preview Customer',
    phone: phone || baseAddress?.phone || randomPhone(),
    line1: baseAddress?.line1 || `${houseNumber}, ${randomChoice(STREET_NAMES)}`,
    line2: [baseLine2, MARKER].filter(Boolean).join(' | '),
    city: baseAddress?.city || cityMeta.city,
    state: baseAddress?.state || cityMeta.state,
    postalCode: baseAddress?.postalCode || `${cityMeta.postalPrefix}${randomInt(100, 999)}`,
    country: baseAddress?.country || 'India',
  };
};

const pickOrderStatus = (paymentStatus) => {
  if (paymentStatus === 'Pending') {
    return randomChoice(['Created', 'Packed', 'Shipped']);
  }

  const roll = Math.random();
  if (roll < 0.45) return 'Delivered';
  if (roll < 0.7) return 'Shipped';
  if (roll < 0.88) return 'Packed';
  if (roll < 0.95) return 'Paid';
  return 'Created';
};

const buildItems = (variantPool) => {
  const maxItems = Math.max(1, Math.floor(MAX_ITEMS_PER_ORDER));
  const count = Math.min(randomInt(1, maxItems), variantPool.length);
  const selected = shuffle(variantPool).slice(0, count);

  let subtotal = 0;

  const items = selected.map((variant) => {
    const productRef = variant.productId?._id || variant.productId;
    const fallbackPrice = randomInt(499, 2999);
    const priceSnapshot = Number(variant.price) > 0 ? Number(variant.price) : fallbackPrice;
    const maxQty = variant.stock > 0 ? Math.min(3, variant.stock) : 1;
    const quantity = randomInt(1, maxQty);

    subtotal += priceSnapshot * quantity;

    return {
      productId: productRef,
      variantId: variant._id,
      quantity,
      priceSnapshot,
    };
  });

  return { items, subtotal };
};

const run = async () => {
  try {
    if (!Number.isFinite(TARGET_ORDERS) || TARGET_ORDERS <= 0) {
      throw new Error('SEED_PREVIEW_ORDER_COUNT must be a positive number');
    }

    if (!Number.isFinite(MAX_ITEMS_PER_ORDER) || MAX_ITEMS_PER_ORDER <= 0) {
      throw new Error('SEED_PREVIEW_MAX_ITEMS must be a positive number');
    }

    await connectDB();

    const [variantPool, users] = await Promise.all([
      Variant.find({}).lean(),
      User.find({ role: 'customer' }).select('name email phone address').lean(),
    ]);

    const orderableVariants = variantPool.filter((variant) => Boolean(variant.productId));

    if (orderableVariants.length === 0) {
      throw new Error('No variants found to build preview orders. Create products/variants first.');
    }

    const guestRatio = clamp(GUEST_RATIO, 0, 1);
    const daysBack = Math.max(0, Math.floor(DAYS_BACK));
    const orderDocs = [];
    let guestCount = 0;

    for (let index = 0; index < TARGET_ORDERS; index += 1) {
      const shouldUseGuest = users.length === 0 || Math.random() < guestRatio;
      const { items, subtotal } = buildItems(orderableVariants);
      const shippingFee = randomChoice([0, 49, 79]);
      const tax = asMoney(subtotal * 0.05);
      const total = asMoney(subtotal + shippingFee + tax);
      const paymentMethod = 'Razorpay';
      const paymentStatus = 'Paid';
      const status = pickOrderStatus(paymentStatus);
      const createdAt = randomDateInPast(daysBack);
      const updatedAt = new Date(createdAt.getTime() + randomInt(5, 480) * 60 * 1000);
      const orderDoc = {
        items,
        subtotal: asMoney(subtotal),
        shippingFee,
        tax,
        total,
        paymentMethod,
        paymentStatus,
        status: ORDER_STATUS.includes(status) ? status : 'Created',
        createdAt,
        updatedAt,
      };

      orderDoc.razorpayOrderId = `order_preview_${Date.now()}_${index + 1}`;

      if (shouldUseGuest) {
        const guest = buildGuestIdentity(index);
        orderDoc.guestInfo = {
          email: guest.email,
          name: guest.name,
          phone: guest.phone,
        };
        orderDoc.address = buildAddress({
          name: guest.name,
          phone: guest.phone,
          baseAddress: null,
        });
        guestCount += 1;
      } else {
        const user = randomChoice(users);
        const customerName = user?.name || 'Preview Customer';
        const customerPhone = user?.phone || user?.address?.phone || randomPhone();
        orderDoc.userId = user._id;
        orderDoc.address = buildAddress({
          name: customerName,
          phone: customerPhone,
          baseAddress: user?.address || null,
        });
      }

      orderDocs.push(orderDoc);
    }

    const orders = await Order.insertMany(orderDocs, { ordered: false });
    const paymentDocs = orders.map((order) => {
      return {
        orderId: order._id,
        provider: 'Razorpay',
        amount: order.total,
        currency: 'INR',
        status: 'Paid',
        razorpayOrderId: order.razorpayOrderId,
        razorpayPaymentId: `pay_preview_${order._id.toString().slice(-10)}`,
        rawPayload: {
          seeded: true,
          marker: MARKER,
          source: 'seed-orders-preview',
        },
      };
    });

    await Payment.insertMany(paymentDocs, { ordered: false });

    const customerOrders = orders.length - guestCount;
    console.log(`Seeded ${orders.length} preview orders (${customerOrders} user, ${guestCount} guest).`);
    console.log(`Marker applied in address.line2: ${MARKER}`);
    console.log('Done.');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Failed to seed preview orders:', error.message);
    process.exit(1);
  }
};

run();
