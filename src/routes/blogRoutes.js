import express from 'express';
import { createBlog, listBlogs, getBlog, updateBlog, deleteBlog } from '../controllers/blogController.js';
import { protect, authorize } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { PERMISSIONS } from '../config/roles.js';

const router = express.Router();

router.get('/', listBlogs);
router.get('/:slug', getBlog);
router.post('/', protect, authorize(PERMISSIONS.BLOG_WRITE), audit('create', 'Blog'), createBlog);
router.put('/:id', protect, authorize(PERMISSIONS.BLOG_WRITE), audit('update', 'Blog'), updateBlog);
router.delete('/:id', protect, authorize(PERMISSIONS.BLOG_WRITE), audit('delete', 'Blog'), deleteBlog);

export default router;
