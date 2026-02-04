import express from 'express';
import { createSubcategory, listSubcategories, updateSubcategory, deleteSubcategory } from '../controllers/subcategoryController.js';
import { protect, authorize } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { PERMISSIONS } from '../config/roles.js';

const router = express.Router();

router.get('/', listSubcategories);
router.post('/', protect, authorize(PERMISSIONS.CATALOG_WRITE), audit('create', 'Subcategory'), createSubcategory);
router.put('/:id', protect, authorize(PERMISSIONS.CATALOG_WRITE), audit('update', 'Subcategory'), updateSubcategory);
router.delete('/:id', protect, authorize(PERMISSIONS.CATALOG_WRITE), audit('delete', 'Subcategory'), deleteSubcategory);

export default router;
