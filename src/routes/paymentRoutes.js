import express from 'express';
import { createRazorpayOrder, verifyPaymentSignature, razorpayWebhook, refundPayment, markPaymentFailed } from '../controllers/paymentController.js';
import { protect, protectOptional, authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/roles.js';

const router = express.Router();

router.post('/razorpay/order', protectOptional, createRazorpayOrder);
router.post('/razorpay/verify', protectOptional, verifyPaymentSignature);
router.post('/razorpay/failed', protectOptional, markPaymentFailed);
router.post('/razorpay/refund', protect, authorize(PERMISSIONS.PAYMENT_WRITE), refundPayment);
router.post('/razorpay/webhook', razorpayWebhook);

export default router;
