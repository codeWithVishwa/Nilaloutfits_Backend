import express from 'express';
import { createCategory, listCategories, updateCategory, deleteCategory } from '../controllers/categoryController.js';
import { protect, authorize } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { PERMISSIONS } from '../config/roles.js';

const router = express.Router();

router.get('/', listCategories);
router.post('/', protect, authorize(PERMISSIONS.CATALOG_WRITE), audit('create', 'Category'), createCategory);
router.put('/:id', protect, authorize(PERMISSIONS.CATALOG_WRITE), audit('update', 'Category'), updateCategory);
router.delete('/:id', protect, authorize(PERMISSIONS.CATALOG_WRITE), audit('delete', 'Category'), deleteCategory);

export default router;
