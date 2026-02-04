import express from 'express';
import {
  createVariant,
  updateVariant,
  deleteVariant,
  listVariantsByProduct,
} from '../controllers/variantController.js';
import { protect, authorize } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { PERMISSIONS } from '../config/roles.js';

const router = express.Router();

router.get('/product/:productId', listVariantsByProduct);
router.post('/', protect, authorize(PERMISSIONS.CATALOG_WRITE), audit('create', 'Variant'), createVariant);
router.put('/:id', protect, authorize(PERMISSIONS.CATALOG_WRITE), audit('update', 'Variant'), updateVariant);
router.delete('/:id', protect, authorize(PERMISSIONS.CATALOG_WRITE), audit('delete', 'Variant'), deleteVariant);

export default router;
