import Category from '../models/Category.js';
import Product from '../models/Product.js';
import Subcategory from '../models/Subcategory.js';
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

export const mergeCategory = async (req, res) => {
  try {
    const { id: sourceCategoryId } = req.params;
    const { targetCategoryId, deactivateSource = true } = req.body;

    if (!targetCategoryId) {
      return res.status(400).json({ message: 'targetCategoryId is required' });
    }

    if (String(sourceCategoryId) === String(targetCategoryId)) {
      return res.status(400).json({ message: 'Source and target category cannot be the same' });
    }

    const [sourceCategory, targetCategory] = await Promise.all([
      Category.findById(sourceCategoryId),
      Category.findById(targetCategoryId),
    ]);

    if (!sourceCategory) return res.status(404).json({ message: 'Source category not found' });
    if (!targetCategory) return res.status(404).json({ message: 'Target category not found' });

    const [productsUpdate, subcategoriesUpdate] = await Promise.all([
      Product.updateMany(
        { categoryId: sourceCategoryId },
        { $set: { categoryId: targetCategoryId } }
      ),
      Subcategory.updateMany(
        { parentCategoryId: sourceCategoryId },
        { $set: { parentCategoryId: targetCategoryId } }
      ),
    ]);

    if (deactivateSource) {
      sourceCategory.status = 'Inactive';
      await sourceCategory.save();
    }

    return res.status(200).json({
      message: 'Category merged successfully',
      sourceCategoryId,
      targetCategoryId,
      productsUpdated: productsUpdate.modifiedCount || 0,
      subcategoriesUpdated: subcategoriesUpdate.modifiedCount || 0,
      sourceDeactivated: Boolean(deactivateSource),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};
