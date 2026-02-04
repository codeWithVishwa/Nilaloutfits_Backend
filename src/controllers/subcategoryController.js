import Subcategory from '../models/Subcategory.js';
import { slugify } from '../utils/slug.js';
import { getPagination } from '../utils/pagination.js';

export const createSubcategory = async (req, res) => {
  try {
    const { name, parentCategoryId, status } = req.body;
    if (!name || !parentCategoryId) {
      return res.status(400).json({ message: 'Name and parentCategoryId are required' });
    }

    const slug = slugify(name);
    const exists = await Subcategory.findOne({ slug });
    if (exists) return res.status(409).json({ message: 'Subcategory already exists' });

    const subcategory = await Subcategory.create({ name, slug, parentCategoryId, status });
    res.status(201).json(subcategory);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const listSubcategories = async (req, res) => {
  try {
    const { limit, skip } = getPagination(req.query);
    const filter = req.query.categoryId ? { parentCategoryId: req.query.categoryId } : {};
    const items = await Subcategory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status, parentCategoryId } = req.body;

    const updates = { status, parentCategoryId };
    if (name) {
      updates.name = name;
      updates.slug = slugify(name);
    }

    const subcategory = await Subcategory.findByIdAndUpdate(id, updates, { new: true });
    if (!subcategory) return res.status(404).json({ message: 'Subcategory not found' });
    res.status(200).json(subcategory);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    const subcategory = await Subcategory.findByIdAndDelete(id);
    if (!subcategory) return res.status(404).json({ message: 'Subcategory not found' });
    res.status(200).json({ message: 'Subcategory deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
