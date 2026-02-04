import Blog from '../models/Blog.js';
import { slugify } from '../utils/slug.js';
import { getPagination } from '../utils/pagination.js';

export const createBlog = async (req, res) => {
  try {
    const { title, content, coverImage, tags, status, referencedProducts } = req.body;
    if (!title || !content) return res.status(400).json({ message: 'Title and content required' });

    const slug = slugify(title);
    const exists = await Blog.findOne({ slug });
    if (exists) return res.status(409).json({ message: 'Blog already exists' });

    const blog = await Blog.create({
      title,
      slug,
      content,
      coverImage,
      tags,
      status,
      referencedProducts,
      authorId: req.user._id,
    });

    res.status(201).json(blog);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const listBlogs = async (req, res) => {
  try {
    const { limit, skip } = getPagination(req.query);
    const filter = req.query.status ? { status: req.query.status } : {};
    const blogs = await Blog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    res.status(200).json(blogs);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getBlog = async (req, res) => {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug });
    if (!blog) return res.status(404).json({ message: 'Blog not found' });
    res.status(200).json(blog);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    if (updates.title) updates.slug = slugify(updates.title);

    const blog = await Blog.findByIdAndUpdate(id, updates, { new: true });
    if (!blog) return res.status(404).json({ message: 'Blog not found' });
    res.status(200).json(blog);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const blog = await Blog.findByIdAndDelete(id);
    if (!blog) return res.status(404).json({ message: 'Blog not found' });
    res.status(200).json({ message: 'Blog deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
