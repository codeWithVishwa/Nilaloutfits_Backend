import express from 'express';
import {
	getDashboardMetrics,
	listUsers,
	updateUser,
	listPayments,
	listVariants,
	listGroupedProducts,
} from '../controllers/adminController.js';
import { listContactMessages } from '../controllers/contactController.js';
import { protect, authorizeRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/metrics', protect, authorizeRole('admin'), getDashboardMetrics);
router.get('/users', protect, authorizeRole('admin'), listUsers);
router.put('/users/:id', protect, authorizeRole('admin'), updateUser);
router.get('/payments', protect, authorizeRole('admin'), listPayments);
router.get('/variants', protect, authorizeRole('admin'), listVariants);
router.get('/messages', protect, authorizeRole('admin'), listContactMessages);
router.get('/products-grouped', protect, authorizeRole('admin'), listGroupedProducts);

export default router;
