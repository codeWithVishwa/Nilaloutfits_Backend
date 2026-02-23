import Category from '../models/Category.js';
import { slugify } from '../utils/slug.js';
import { getPagination } from '../utils/pagination.js';

export const createCategory = async (req, res) => {
  try {
    const { name, description, status } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    const slug = slugify(name);
    const exists = await Category.findOne({ slug });
    if (exists) {
      if (exists.status !== 'Active') {
        exists.name = name;
        exists.description = description ?? exists.description;
        exists.status = 'Active';
        await exists.save();
        return res.status(200).json(exists);
      }
      return res.status(409).json({ message: 'Category already exists' });
    }

    const category = await Category.create({ name, slug, description, status });
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const listCategories = async (req, res) => {
  try {
    const { limit, skip } = getPagination(req.query);
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
    const filter = includeInactive ? {} : { status: 'Active' };
    const items = await Category.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
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
    const category = await Category.findByIdAndUpdate(
      id,
      { status: 'Inactive' },
      { new: true }
    );
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.status(200).json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
