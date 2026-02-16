import express from 'express';
import { createRazorpayOrder, verifyPaymentSignature, razorpayWebhook, refundPayment, markPaymentFailed } from '../controllers/paymentController.js';
import { protect, authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/roles.js';

const router = express.Router();

router.post('/razorpay/order', protect, authorize(PERMISSIONS.PAYMENT_WRITE), createRazorpayOrder);
router.post('/razorpay/verify', protect, authorize(PERMISSIONS.PAYMENT_WRITE), verifyPaymentSignature);
router.post('/razorpay/failed', protect, authorize(PERMISSIONS.PAYMENT_WRITE), markPaymentFailed);
router.post('/razorpay/refund', protect, authorize(PERMISSIONS.PAYMENT_WRITE), refundPayment);
router.post('/razorpay/webhook', razorpayWebhook);

export default router;
