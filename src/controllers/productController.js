import Product from '../models/Product.js';
import Variant from '../models/Variant.js';
import Order from '../models/Order.js';
import { slugify } from '../utils/slug.js';
import { getPagination } from '../utils/pagination.js';

const generateUniqueSlug = async (title, excludeId) => {
  const base = slugify(title);
  let candidate = base;
  let suffix = 2;

  // Ensure slug uniqueness even when multiple products share the same title.
  while (
    await Product.exists({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
};

export const createProduct = async (req, res) => {
  try {
    const {
      title,
      description,
      categoryId,
      subcategoryId,
      brand,
      images,
      colorVariants,
      tags,
      status,
      price,
      stock,
      featuredBestSelling,
      featuredRecent,
      featuredVariantIds,
    } = req.body;
    if (!title || !categoryId || price === undefined || stock === undefined) {
      return res.status(400).json({ message: 'Title, categoryId, price, and stock are required' });
    }

    const cleanSubcategoryId = subcategoryId ? subcategoryId : undefined;

    const product = await Product.create({
      title,
      slug: await generateUniqueSlug(title),
      description,
      categoryId,
      subcategoryId: cleanSubcategoryId,
      brand,
      price,
      stock,
      images,
      colorVariants,
      tags,
      status,
      featuredBestSelling: Boolean(featuredBestSelling),
      featuredRecent: Boolean(featuredRecent),
      featuredVariantIds: Array.isArray(featuredVariantIds) ? featuredVariantIds : [],
    });

    res.status(201).json(product);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Product with same title already exists' });
    }
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error?.message || 'Server error' });
  }
};

export const listProducts = async (req, res) => {
  try {
    const { limit, skip } = getPagination(req.query);
    const { q, categoryId, subcategoryId, size, priceMin, priceMax, availability, sort } = req.query;

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

    const pageSize = limit || 12;
    const pageSkip = skip || 0;

    if (sort === 'best-selling') {
      const curated = await Product.find({
        ...filter,
        featuredBestSelling: true,
      })
        .sort({ updatedAt: -1 })
        .skip(pageSkip)
        .limit(pageSize);

      if (curated.length > 0) {
        return res.status(200).json(curated);
      }

      const maxToFetch = Math.max(pageSize + pageSkip, pageSize) * 5;

      const topSelling = await Order.aggregate([
        { $match: { paymentStatus: 'Paid' } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            sold: { $sum: '$items.quantity' },
          },
        },
        { $sort: { sold: -1 } },
        { $limit: maxToFetch },
      ]);

      const rankedIds = topSelling.map((item) => item._id);
      if (rankedIds.length === 0) {
        const fallback = await Product.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit);
        return res.status(200).json(fallback);
      }

      const products = await Product.find({
        ...filter,
        _id: { $in: rankedIds },
      });

      const rankedProducts = rankedIds
        .map((id) => products.find((product) => product._id.toString() === id.toString()))
        .filter(Boolean);

      const pagedProducts = rankedProducts.slice(pageSkip, pageSkip + pageSize);
      return res.status(200).json(pagedProducts);
    }

    if (sort === 'recent' || sort === 'new') {
      const curated = await Product.find({
        ...filter,
        featuredRecent: true,
      })
        .sort({ updatedAt: -1 })
        .skip(pageSkip)
        .limit(pageSize);

      if (curated.length > 0) {
        return res.status(200).json(curated);
      }
    }

    const sortBy = (() => {
      if (sort === 'price:asc') return { price: 1 };
      if (sort === 'price:desc') return { price: -1 };
      if (sort === 'recent' || sort === 'new') return { createdAt: -1 };
      return { createdAt: -1 };
    })();

    const products = await Product.find(filter)
      .sort(sortBy)
      .skip(pageSkip)
      .limit(pageSize);

    return res.status(200).json(products);
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
    if (updates.title) updates.slug = await generateUniqueSlug(updates.title, id);
    if (updates.featuredBestSelling !== undefined) {
      updates.featuredBestSelling = Boolean(updates.featuredBestSelling);
    }
    if (updates.featuredRecent !== undefined) {
      updates.featuredRecent = Boolean(updates.featuredRecent);
    }
    if (updates.featuredVariantIds !== undefined) {
      updates.featuredVariantIds = Array.isArray(updates.featuredVariantIds) ? updates.featuredVariantIds : [];
    }

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
