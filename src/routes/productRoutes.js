import express from 'express';
import {
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  recommendProducts,
} from '../controllers/productController.js';
import { protect, authorize } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { PERMISSIONS } from '../config/roles.js';

const router = express.Router();

router.get('/', listProducts);
router.get('/recommendations', recommendProducts);
router.get('/:id', getProduct);
router.post('/', protect, authorize(PERMISSIONS.CATALOG_WRITE), audit('create', 'Product'), createProduct);
router.put('/:id', protect, authorize(PERMISSIONS.CATALOG_WRITE), audit('update', 'Product'), updateProduct);
router.delete('/:id', protect, authorize(PERMISSIONS.CATALOG_WRITE), audit('delete', 'Product'), deleteProduct);

export default router;
