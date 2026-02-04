import express from 'express';
import { getDashboardMetrics } from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/roles.js';

const router = express.Router();

router.get('/metrics', protect, authorize(PERMISSIONS.ORDER_READ), getDashboardMetrics);

export default router;
