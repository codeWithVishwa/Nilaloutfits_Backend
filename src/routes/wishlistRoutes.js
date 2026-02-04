import express from 'express';
import { getWishlist, addToWishlist, removeFromWishlist } from '../controllers/wishlistController.js';
import { protect, authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/roles.js';

const router = express.Router();

router.get('/', protect, authorize(PERMISSIONS.WISHLIST), getWishlist);
router.post('/', protect, authorize(PERMISSIONS.WISHLIST), addToWishlist);
router.delete('/:productId', protect, authorize(PERMISSIONS.WISHLIST), removeFromWishlist);

export default router;
