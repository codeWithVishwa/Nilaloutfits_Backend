import express from 'express';
import { getCart, addToCart, updateCartItem, removeCartItem } from '../controllers/cartController.js';
import { protect, authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/roles.js';

const router = express.Router();

router.get('/', protect, authorize(PERMISSIONS.CART), getCart);
router.post('/', protect, authorize(PERMISSIONS.CART), addToCart);
router.put('/', protect, authorize(PERMISSIONS.CART), updateCartItem);
router.delete('/:variantId', protect, authorize(PERMISSIONS.CART), removeCartItem);

export default router;
