import express from 'express';
import { createReview, listProductReviews } from '../controllers/reviewController.js';
import { protect, authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/roles.js';

const router = express.Router();

router.get('/product/:productId', listProductReviews);
router.post('/', protect, authorize(PERMISSIONS.REVIEW_WRITE), createReview);

export default router;
