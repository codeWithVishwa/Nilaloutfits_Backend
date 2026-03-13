import crypto from 'crypto';
import razorpay from '../config/razorpay.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Variant from '../models/Variant.js';
import { sendOrderInvoiceEmail } from '../utils/invoiceEmail.js';
import { emitStockUpdate } from '../socket/index.js';

const restoreOrderStock = async (order) => {
  if (!order?.items?.length) return;

  const variantIds = order.items.map((item) => item.variantId);
  const variants = await Variant.find({ _id: { $in: variantIds } });

  for (const item of order.items) {
    const variant = variants.find((v) => v._id.toString() === item.variantId.toString());
    if (!variant) continue;
    variant.stock += item.quantity;
    variant.availability = variant.stock > 0 ? 'InStock' : 'OutOfStock';
    await variant.save();
    emitStockUpdate(variant);
  }
};

const reReserveOrderStock = async (order) => {
  if (!order?.items?.length) return { adjusted: false, shortages: [] };

  const variantIds = order.items.map((item) => item.variantId);
  const variants = await Variant.find({ _id: { $in: variantIds } });
  const shortages = [];

  for (const item of order.items) {
    const variant = variants.find((v) => v._id.toString() === item.variantId.toString());
    if (!variant) continue;

    const requested = Number(item.quantity || 0);
    const available = Number(variant.stock || 0);
    const nextStock = Math.max(0, available - requested);
    if (available < requested) {
      shortages.push({
        variantId: variant._id,
        requested,
        available,
      });
    }

    variant.stock = nextStock;
    variant.availability = variant.stock > 0 ? 'InStock' : 'OutOfStock';
    await variant.save();
    emitStockUpdate(variant);
  }

  return { adjusted: true, shortages };
};

const isOrderPaid = (order, payment) => {
  return (
    payment?.status === 'Paid' ||
    order?.paymentStatus === 'Paid' ||
    order?.status === 'Paid'
  );
};

const canCancelUnpaidOrder = (order) => {
  if (!order) return false;
  return order.paymentStatus === 'Pending' && order.status === 'Created';
};

const signaturesMatch = (expected, actual) => {
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  const actualBuffer = Buffer.from(String(actual || ''), 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};

const markOrderAsPaid = async ({ payment, order, razorpayPaymentId, razorpaySignature, rawPayload }) => {
  if (!payment) return null;

  const shouldReReserveStock =
    order &&
    order.paymentStatus !== 'Paid' &&
    (order.status === 'Cancelled' || order.paymentStatus === 'Failed');

  let stockAdjustmentMeta = null;
  if (shouldReReserveStock) {
    stockAdjustmentMeta = await reReserveOrderStock(order);
  }

  const nextPaymentUpdate = {
    status: 'Paid',
    ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
    ...(razorpaySignature ? { razorpaySignature } : {}),
    ...(rawPayload || stockAdjustmentMeta
      ? {
        rawPayload: {
          ...(payment.rawPayload || {}),
          ...(rawPayload || {}),
          ...(stockAdjustmentMeta ? { stockAdjustment: stockAdjustmentMeta } : {}),
        },
      }
      : {}),
  };

  await Payment.findByIdAndUpdate(payment._id, nextPaymentUpdate, { new: true });

  if (order) {
    await Order.findByIdAndUpdate(order._id, {
      paymentStatus: 'Paid',
      status: 'Paid',
    });
  }

  return true;
};

const validateOrderAccess = (req, order) => {
  if (!order) {
    return { allowed: true };
  }

  if (req.user && order.userId && String(order.userId) !== String(req.user._id)) {
    return { allowed: false, status: 403, message: 'Forbidden' };
  }

  if (!req.user && order.userId) {
    return { allowed: false, status: 401, message: 'Not authorized' };
  }

  return { allowed: true };
};

const validateRazorpayWebhookSignature = (req) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
  if (!webhookSecret) {
    return { valid: false, status: 500, message: 'Razorpay webhook secret not configured' };
  }

  const signature = req.get('x-razorpay-signature');
  if (!signature) {
    return { valid: false, status: 400, message: 'Missing webhook signature' };
  }

  if (!req.rawBody || !Buffer.isBuffer(req.rawBody)) {
    return { valid: false, status: 400, message: 'Missing webhook raw body' };
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(req.rawBody)
    .digest('hex');

  if (!signaturesMatch(expectedSignature, signature)) {
    return { valid: false, status: 401, message: 'Invalid webhook signature' };
  }

  return { valid: true };
};

export const createRazorpayOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ message: 'orderId is required' });

    if (!razorpay) return res.status(500).json({ message: 'Razorpay not configured' });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const access = validateOrderAccess(req, order);
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.total * 100),
      currency: 'INR',
      receipt: `order_${order._id}`,
    });

    await Payment.findOneAndUpdate(
      { orderId: order._id },
      { razorpayOrderId: razorpayOrder.id, amount: order.total, currency: 'INR' },
      { new: true, upsert: true }
    );

    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    res.status(200).json(razorpayOrder);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const verifyPaymentSignature = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ message: 'Missing payment fields' });
    }

    const body = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (!signaturesMatch(expected, razorpaySignature)) {
      return res.status(400).json({ message: 'Invalid signature' });
    }

    const payment = await Payment.findOne({ razorpayOrderId });
    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found' });
    }

    const order = payment?.orderId ? await Order.findById(payment.orderId) : null;
    if (!order) {
      return res.status(404).json({ message: 'Order not found for payment' });
    }

    if (isOrderPaid(order, payment)) {
      return res.status(200).json({ message: 'Payment already verified' });
    }

    if (order) {
      const access = validateOrderAccess(req, order);
      if (!access.allowed) {
        return res.status(access.status).json({ message: access.message });
      }
    }

    await markOrderAsPaid({
      payment,
      order,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (payment?.orderId) {
      sendOrderInvoiceEmail(payment.orderId);
    }

    res.status(200).json({ message: 'Payment verified' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const razorpayWebhook = async (req, res) => {
  try {
    const signatureValidation = validateRazorpayWebhookSignature(req);
    if (!signatureValidation.valid) {
      return res.status(signatureValidation.status).json({ message: signatureValidation.message });
    }

    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ message: 'Invalid webhook payload' });
    }

    const event = payload.event;
    if (event === 'payment.captured') {
      const paymentEntity = payload.payload?.payment?.entity;
      const razorpayOrderId = paymentEntity?.order_id;
      const razorpayPaymentId = paymentEntity?.id;

      if (razorpayOrderId) {
        const payment = await Payment.findOne({ razorpayOrderId });
        const order = payment?.orderId ? await Order.findById(payment.orderId) : null;
        if (payment && order && !isOrderPaid(order, payment)) {
          await markOrderAsPaid({
            payment,
            order,
            razorpayPaymentId,
            rawPayload: payload,
          });
          sendOrderInvoiceEmail(order._id);
        }
      }
    }

    if (event === 'payment.failed') {
      const paymentEntity = payload.payload?.payment?.entity;
      if (paymentEntity?.order_id) {
        const payment = await Payment.findOne({ razorpayOrderId: paymentEntity.order_id });
        if (payment) {
          const order = await Order.findById(payment.orderId);

          if (isOrderPaid(order, payment)) {
            return res.status(200).json({ received: true, ignored: 'already_paid' });
          }

          await Payment.findByIdAndUpdate(payment._id, { status: 'Failed', rawPayload: payload });

          if (canCancelUnpaidOrder(order)) {
            await restoreOrderStock(order);
            await Order.findByIdAndUpdate(order._id, { paymentStatus: 'Failed', status: 'Cancelled' });
          }
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const markPaymentFailed = async (req, res) => {
  try {
    const { orderId, razorpayOrderId, reason } = req.body;
    if (!orderId && !razorpayOrderId) {
      return res.status(400).json({ message: 'orderId or razorpayOrderId is required' });
    }

    const payment = orderId
      ? await Payment.findOne({ orderId })
      : await Payment.findOne({ razorpayOrderId });

    const order = orderId
      ? await Order.findById(orderId)
      : payment?.orderId
        ? await Order.findById(payment.orderId)
        : null;

    if (order) {
      const access = validateOrderAccess(req, order);
      if (!access.allowed) {
        return res.status(access.status).json({ message: access.message });
      }
    }

    if (isOrderPaid(order, payment)) {
      return res.status(200).json({ message: 'Payment already confirmed' });
    }

    const effectiveRazorpayOrderId = razorpayOrderId || payment?.razorpayOrderId || order?.razorpayOrderId;
    if (razorpay && effectiveRazorpayOrderId) {
      try {
        const orderPayments = await razorpay.orders.fetchPayments(effectiveRazorpayOrderId);
        const capturedPayment = Array.isArray(orderPayments?.items)
          ? orderPayments.items.find((item) => item?.status === 'captured')
          : null;

        if (capturedPayment) {
          let paidSynced = false;
          if (payment) {
            await markOrderAsPaid({
              payment,
              order,
              razorpayPaymentId: capturedPayment.id,
              rawPayload: { reason, capturedPayment },
            });
            paidSynced = true;
          } else if (order?._id) {
            const fallbackPayment = await Payment.findOne({ orderId: order._id });
            if (fallbackPayment) {
              await markOrderAsPaid({
                payment: fallbackPayment,
                order,
                razorpayPaymentId: capturedPayment.id,
                rawPayload: { reason, capturedPayment },
              });
              paidSynced = true;
            } else {
              const createdPayment = await Payment.create({
                orderId: order._id,
                provider: 'Razorpay',
                amount: Number(order.total || 0),
                currency: 'INR',
                status: 'Pending',
                razorpayOrderId: effectiveRazorpayOrderId,
              });
              await markOrderAsPaid({
                payment: createdPayment,
                order,
                razorpayPaymentId: capturedPayment.id,
                rawPayload: { reason, capturedPayment },
              });
              paidSynced = true;
            }
          }
          if (paidSynced && order?._id) {
            sendOrderInvoiceEmail(order._id);
          }
          return res.status(200).json({ message: 'Payment already captured' });
        }
      } catch {
        // Ignore fetch failures and continue with local fallback.
      }
    }

    if (payment) {
      await Payment.findByIdAndUpdate(payment._id, {
        status: 'Failed',
        rawPayload: { reason },
      });
    }

    if (canCancelUnpaidOrder(order)) {
      await restoreOrderStock(order);
      await Order.findByIdAndUpdate(order._id, { paymentStatus: 'Failed', status: 'Cancelled' });
    }

    res.status(200).json({ message: 'Payment marked as failed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const refundPayment = async (req, res) => {
  try {
    const { paymentId, amount } = req.body;
    if (!paymentId) return res.status(400).json({ message: 'paymentId is required' });

    if (!razorpay) return res.status(500).json({ message: 'Razorpay not configured' });

    const refund = await razorpay.payments.refund(paymentId, amount ? { amount } : undefined);

    await Payment.findOneAndUpdate(
      { razorpayPaymentId: paymentId },
      { status: 'Refunded', rawPayload: refund },
      { new: true }
    );

    res.status(200).json(refund);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
