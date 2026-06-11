import express from 'express';
import rateLimit from 'express-rate-limit';
import {
	getDashboardMetrics,
	listUsers,
	updateUser,
	listPayments,
	listVariants,
	listGroupedProducts,
	getOnlineUsers,
} from '../controllers/adminController.js';
import { listContactMessages } from '../controllers/contactController.js';
import { protect, authorizeRole } from '../middleware/auth.js';

const router = express.Router();

// Strict per-IP limit for the live-presence endpoint: enough for a dashboard
// polling every ~10s, hostile scraping gets cut off.
const onlineUsersLimiter = rateLimit({
	windowMs: 5 * 60 * 1000,
	max: 60,
	standardHeaders: true,
	legacyHeaders: false,
	message: { message: 'Too many requests to the online-users metric. Slow down.' },
});

router.get('/metrics', protect, authorizeRole('admin'), getDashboardMetrics);
router.get('/users', protect, authorizeRole('admin'), listUsers);
router.put('/users/:id', protect, authorizeRole('admin'), updateUser);
router.get('/payments', protect, authorizeRole('admin'), listPayments);
router.get('/variants', protect, authorizeRole('admin'), listVariants);
router.get('/messages', protect, authorizeRole('admin'), listContactMessages);
router.get('/products-grouped', protect, authorizeRole('admin'), listGroupedProducts);
router.get('/online-users', onlineUsersLimiter, protect, authorizeRole('admin'), getOnlineUsers);

export default router;
