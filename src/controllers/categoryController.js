import Category from '../models/Category.js';
import { slugify } from '../utils/slug.js';
import { getPagination } from '../utils/pagination.js';

export const createCategory = async (req, res) => {
  try {
    const { name, description, status } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    const slug = slugify(name);
    const exists = await Category.findOne({ slug });
    if (exists) return res.status(409).json({ message: 'Category already exists' });

    const category = await Category.create({ name, slug, description, status });
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const listCategories = async (req, res) => {
  try {
    const { limit, skip } = getPagination(req.query);
    const items = await Category.find().sort({ createdAt: -1 }).skip(skip).limit(limit);
    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;

    const updates = { description, status };
    if (name) {
      updates.name = name;
      updates.slug = slugify(name);
    }

    const category = await Category.findByIdAndUpdate(id, updates, { new: true });
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.status(200).json(category);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByIdAndDelete(id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.status(200).json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
