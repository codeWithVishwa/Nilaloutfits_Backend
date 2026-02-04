import Product from '../models/Product.js';
import Variant from '../models/Variant.js';
import { slugify } from '../utils/slug.js';
import { getPagination } from '../utils/pagination.js';

export const createProduct = async (req, res) => {
  try {
    const { title, description, categoryId, subcategoryId, brand, images, tags, status } = req.body;
    if (!title || !categoryId) {
      return res.status(400).json({ message: 'Title and categoryId are required' });
    }

    const product = await Product.create({
      title,
      slug: slugify(title),
      description,
      categoryId,
      subcategoryId,
      brand,
      images,
      tags,
      status,
    });

    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const listProducts = async (req, res) => {
  try {
    const { limit, skip } = getPagination(req.query);
    const { q, categoryId, subcategoryId, size, priceMin, priceMax, availability } = req.query;

    const filter = {};
    if (categoryId) filter.categoryId = categoryId;
    if (subcategoryId) filter.subcategoryId = subcategoryId;
    if (q) filter.$text = { $search: q };

    let productIdsFromVariants = null;
    if (size || priceMin || priceMax || availability) {
      const variantFilter = {};
      if (size) variantFilter.size = size;
      if (availability) variantFilter.availability = availability;
      if (priceMin || priceMax) {
        variantFilter.price = {};
        if (priceMin) variantFilter.price.$gte = Number(priceMin);
        if (priceMax) variantFilter.price.$lte = Number(priceMax);
      }

      const variants = await Variant.find(variantFilter).select('productId');
      productIdsFromVariants = variants.map((v) => v.productId);
      filter._id = { $in: productIdsFromVariants };
    }

    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const variants = await Variant.find({ productId: id });
    res.status(200).json({ product, variants });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    if (updates.title) updates.slug = slugify(updates.title);

    const product = await Product.findByIdAndUpdate(id, updates, { new: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndDelete(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    await Variant.deleteMany({ productId: id });
    res.status(200).json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const recommendProducts = async (req, res) => {
  try {
    const { productId } = req.query;
    if (!productId) return res.status(400).json({ message: 'productId is required' });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const recommendations = await Product.find({
      _id: { $ne: productId },
      $or: [
        { categoryId: product.categoryId },
        { tags: { $in: product.tags || [] } },
      ],
    }).limit(12);

    res.status(200).json(recommendations);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
