import mongoose from 'mongoose';
import { PAYMENT_STATUS } from '../config/constants.js';

const paymentSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    provider: { type: String, default: 'Razorpay' },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: PAYMENT_STATUS, default: 'Pending' },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    rawPayload: { type: Object },
  },
  { timestamps: true }
);

paymentSchema.index({ orderId: 1 });

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
