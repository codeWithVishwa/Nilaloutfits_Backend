import express from 'express';
import { createOrder, listOrders, listAllOrders, updateOrderStatus, trackGuestOrder } from '../controllers/orderController.js';
import { protect, protectOptional, authorize, authorizeRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { PERMISSIONS } from '../config/roles.js';

const router = express.Router();

router.post('/', protectOptional, audit('create', 'Order'), createOrder);
router.post('/track', trackGuestOrder);
router.get('/', protect, authorize(PERMISSIONS.ORDER_READ), listOrders);
router.get('/admin/all', protect, authorizeRole('admin'), listAllOrders);
router.put('/:id/status', protect, authorizeRole('admin'), audit('update', 'Order'), updateOrderStatus);

export default router;
