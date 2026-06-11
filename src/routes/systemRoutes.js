import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  getSystemHealth,
  getSystemTraffic,
  listBlockedIps,
  blockIp,
  unblockIp,
} from '../controllers/systemController.js';
import { protect, authorizeRole } from '../middleware/auth.js';
import { superAdminGuard } from '../middleware/superAdmin.js';

const router = express.Router();

// Strict per-IP limit for the whole system-monitor surface: plenty for an admin
// dashboard polling every few seconds, hostile callers get cut off fast.
const systemLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many system-monitor requests. Slow down.' },
});

// Everything here requires an admin JWT *and* the super-admin credentials from
// .env (sent base64-encoded via the x-super-auth header).
router.use(systemLimiter, protect, authorizeRole('admin'), superAdminGuard);

router.get('/health', getSystemHealth);
router.get('/traffic', getSystemTraffic);
router.get('/blocked-ips', listBlockedIps);
router.post('/blocked-ips', blockIp);
router.delete('/blocked-ips/:ip', unblockIp);

export default router;
