import express from 'express';
import {
  register,
  login,
  refreshAccessToken,
  logout,
  me,
  updateMe,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
} from '../controllers/authController.js';
import { protect, authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/roles.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refreshAccessToken);
router.post('/logout', logout);
router.get('/me', protect, me);
router.put('/me', protect, updateMe);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);

router.get('/admin', protect, authorize(PERMISSIONS.USER_READ), (req, res) => {
  res.status(200).json({ message: 'Admin access granted' });
});

router.get('/moderator', protect, authorize(PERMISSIONS.CATALOG_WRITE), (req, res) => {
  res.status(200).json({ message: 'Moderator access granted' });
});

export default router;
