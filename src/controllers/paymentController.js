import crypto from 'crypto';
import razorpay from '../config/razorpay.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import { sendOrderInvoiceEmail } from '../utils/invoiceEmail.js';

export const createRazorpayOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ message: 'orderId is required' });

    if (!razorpay) return res.status(500).json({ message: 'Razorpay not configured' });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });

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

    if (expected !== razorpaySignature) {
      return res.status(400).json({ message: 'Invalid signature' });
    }

    const payment = await Payment.findOneAndUpdate(
      { razorpayOrderId },
      {
        razorpayPaymentId,
        razorpaySignature,
        status: 'Paid',
      },
      { new: true }
    );

    if (payment) {
      await Order.findByIdAndUpdate(payment.orderId, {
        paymentStatus: 'Paid',
        status: 'Paid',
      });
      sendOrderInvoiceEmail(payment.orderId);
    }

    res.status(200).json({ message: 'Payment verified' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const razorpayWebhook = async (req, res) => {
  try {
    const payload = req.body;
    const event = payload.event;
    if (event === 'payment.failed') {
      const paymentEntity = payload.payload?.payment?.entity;
      if (paymentEntity?.order_id) {
        await Payment.findOneAndUpdate(
          { razorpayOrderId: paymentEntity.order_id },
          { status: 'Failed', rawPayload: payload }
        );
        const payment = await Payment.findOne({ razorpayOrderId: paymentEntity.order_id });
        if (payment) {
          await Order.findByIdAndUpdate(payment.orderId, { paymentStatus: 'Failed' });
        }
      }
    }

    res.status(200).json({ received: true });
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
