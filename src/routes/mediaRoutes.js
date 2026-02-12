import express from 'express';
import upload from '../middleware/upload.js';
import { uploadMedia } from '../controllers/mediaController.js';
import { protect, authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/roles.js';

const router = express.Router();

router.post('/', protect, authorize(PERMISSIONS.CATALOG_WRITE), upload.single('file'), uploadMedia);
router.post('/upload', protect, authorize(PERMISSIONS.CATALOG_WRITE), upload.single('file'), uploadMedia);

export default router;
