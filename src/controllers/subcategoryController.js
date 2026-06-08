import Subcategory from '../models/Subcategory.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import { slugify } from '../utils/slug.js';
import { getPagination } from '../utils/pagination.js';

const normalizeOptionalId = (value) => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null') return null;
  return text;
};

const validateParentSubcategory = async ({ parentCategoryId, parentSubcategoryId, currentId = null }) => {
  if (parentSubcategoryId === null || parentSubcategoryId === undefined) return null;
  if (currentId && String(parentSubcategoryId) === String(currentId)) {
    return { error: 'Subcategory cannot be parent of itself', status: 400 };
  }

  const parentSubcategory = await Subcategory.findById(parentSubcategoryId);
  if (!parentSubcategory) {
    return { error: 'Parent main subcategory not found', status: 404 };
  }

  if (parentSubcategory.parentSubcategoryId) {
    return { error: 'Only one nested subcategory level is supported', status: 400 };
  }

  if (String(parentSubcategory.parentCategoryId) !== String(parentCategoryId)) {
    return { error: 'Parent main subcategory must belong to selected category', status: 400 };
  }

  return parentSubcategory;
};

export const createSubcategory = async (req, res) => {
  try {
    const { name, parentCategoryId, parentSubcategoryId, status } = req.body;
    if (!name || !parentCategoryId) {
      return res.status(400).json({ message: 'Name and parentCategoryId are required' });
    }

    const category = await Category.findById(parentCategoryId).select('_id');
    if (!category) return res.status(404).json({ message: 'Parent category not found' });

    const normalizedParentSubcategoryId = normalizeOptionalId(parentSubcategoryId);
    const parentValidation = await validateParentSubcategory({
      parentCategoryId,
      parentSubcategoryId: normalizedParentSubcategoryId,
    });
    if (parentValidation?.error) {
      return res.status(parentValidation.status).json({ message: parentValidation.error });
    }

    const slug = slugify(name);
    const exists = await Subcategory.findOne({
      slug,
      parentCategoryId,
      parentSubcategoryId: normalizedParentSubcategoryId ?? null,
    });
    if (exists) return res.status(409).json({ message: 'Subcategory already exists' });

    const subcategory = await Subcategory.create({
      name,
      slug,
      parentCategoryId,
      parentSubcategoryId: normalizedParentSubcategoryId ?? null,
      status,
    });
    res.status(201).json(subcategory);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Subcategory already exists for this parent' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

export const listSubcategories = async (req, res) => {
  try {
    const { limit, skip } = getPagination(req.query);
    const filter = req.query.categoryId ? { parentCategoryId: req.query.categoryId } : {};
    const mainOnly = String(req.query.mainOnly || '').toLowerCase() === 'true';
    const normalizedParentSubcategoryId = normalizeOptionalId(req.query.parentSubcategoryId);
    if (mainOnly) {
      filter.parentSubcategoryId = null;
    } else if (normalizedParentSubcategoryId !== undefined) {
      filter.parentSubcategoryId = normalizedParentSubcategoryId;
    }

    const items = await Subcategory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    // Subcategories change rarely and don't vary by user; cache the public listing.
    res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status, parentCategoryId, parentSubcategoryId } = req.body;
    const subcategory = await Subcategory.findById(id);
    if (!subcategory) return res.status(404).json({ message: 'Subcategory not found' });

    const nextParentCategoryId = parentCategoryId || subcategory.parentCategoryId;
    const nextParentSubcategoryId = normalizeOptionalId(parentSubcategoryId);
    const resolvedParentSubcategoryId =
      nextParentSubcategoryId === undefined ? subcategory.parentSubcategoryId : nextParentSubcategoryId;
    const nextSlug = name ? slugify(name) : subcategory.slug;

    const category = await Category.findById(nextParentCategoryId).select('_id');
    if (!category) return res.status(404).json({ message: 'Parent category not found' });

    const parentValidation = await validateParentSubcategory({
      parentCategoryId: nextParentCategoryId,
      parentSubcategoryId: resolvedParentSubcategoryId,
      currentId: id,
    });
    if (parentValidation?.error) {
      return res.status(parentValidation.status).json({ message: parentValidation.error });
    }

    const duplicate = await Subcategory.findOne({
      _id: { $ne: id },
      slug: nextSlug,
      parentCategoryId: nextParentCategoryId,
      parentSubcategoryId: resolvedParentSubcategoryId ?? null,
    }).select('_id');
    if (duplicate) {
      return res.status(409).json({ message: 'Subcategory already exists for this parent' });
    }

    if (name) subcategory.name = name;
    if (status) subcategory.status = status;
    subcategory.slug = nextSlug;
    subcategory.parentCategoryId = nextParentCategoryId;
    subcategory.parentSubcategoryId = resolvedParentSubcategoryId ?? null;

    await subcategory.save();
    res.status(200).json(subcategory);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Subcategory already exists for this parent' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    const [childrenCount, productCount] = await Promise.all([
      Subcategory.countDocuments({ parentSubcategoryId: id }),
      Product.countDocuments({ subcategoryId: id }),
    ]);

    if (childrenCount > 0) {
      return res.status(400).json({ message: 'Delete child subcategories first' });
    }
    if (productCount > 0) {
      return res.status(400).json({ message: 'Cannot delete subcategory with linked products' });
    }

    const subcategory = await Subcategory.findByIdAndDelete(id);
    if (!subcategory) return res.status(404).json({ message: 'Subcategory not found' });
    res.status(200).json({ message: 'Subcategory deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
