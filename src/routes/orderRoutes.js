import express from 'express';
import { createOrder, listOrders, listAllOrders, updateOrderStatus } from '../controllers/orderController.js';
import { protect, authorize } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { PERMISSIONS } from '../config/roles.js';

const router = express.Router();

router.post('/', protect, authorize(PERMISSIONS.ORDER_WRITE), audit('create', 'Order'), createOrder);
router.get('/', protect, authorize(PERMISSIONS.ORDER_READ), listOrders);
router.get('/admin/all', protect, authorize(PERMISSIONS.ORDER_WRITE), listAllOrders);
router.put('/:id/status', protect, authorize(PERMISSIONS.ORDER_WRITE), audit('update', 'Order'), updateOrderStatus);

export default router;
