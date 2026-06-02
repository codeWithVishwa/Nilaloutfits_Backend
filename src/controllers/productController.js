import Product from '../models/Product.js';
import Variant from '../models/Variant.js';
import Order from '../models/Order.js';
import Subcategory from '../models/Subcategory.js';
import { slugify } from '../utils/slug.js';
import { getPagination } from '../utils/pagination.js';
import { syncAutoVariantForProduct } from '../utils/defaultVariant.js';

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
      regularPrice,
      sellingPrice,
      shippingCost,
    } = req.body;
    const resolvedSellingPrice =
      sellingPrice !== undefined && sellingPrice !== null && String(sellingPrice).trim() !== ''
        ? Number(sellingPrice)
        : Number(price);
    const resolvedRegularPrice =
      regularPrice !== undefined && regularPrice !== null && String(regularPrice).trim() !== ''
        ? Number(regularPrice)
        : undefined;
    const resolvedShippingCost =
      shippingCost !== undefined && shippingCost !== null && String(shippingCost).trim() !== ''
        ? Number(shippingCost)
        : 0;

    if (!title || !categoryId || Number.isNaN(resolvedSellingPrice) || stock === undefined) {
      return res.status(400).json({ message: 'Title, categoryId, selling/price, and stock are required' });
    }

    if (resolvedRegularPrice !== undefined && Number.isNaN(resolvedRegularPrice)) {
      return res.status(400).json({ message: 'regularPrice must be a valid number' });
    }
    if (!Number.isFinite(resolvedShippingCost) || resolvedShippingCost < 0) {
      return res.status(400).json({ message: 'shippingCost must be a non-negative number' });
    }

    const cleanSubcategoryId = subcategoryId ? subcategoryId : undefined;

    const product = await Product.create({
      title,
      slug: await generateUniqueSlug(title),
      description,
      categoryId,
      subcategoryId: cleanSubcategoryId,
      brand,
      price: resolvedSellingPrice,
      sellingPrice: resolvedSellingPrice,
      regularPrice: resolvedRegularPrice,
      shippingCost: resolvedShippingCost,
      stock,
      images,
      colorVariants,
      tags,
      status,
      featuredBestSelling: Boolean(featuredBestSelling),
      featuredRecent: Boolean(featuredRecent),
      featuredVariantIds: Array.isArray(featuredVariantIds) ? featuredVariantIds : [],
    });

    // Ensure the auto-variant exists from creation so reads can stay write-free.
    await syncAutoVariantForProduct(product);

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
    // Extract and sanitize query parameters
    const { limit, skip } = getPagination(req.query);
    const { 
      q, 
      categoryId, 
      subcategoryId, 
      mainSubcategoryId,
      size, 
      priceMin, 
      priceMax, 
      availability, 
      sort,
      status 
    } = req.query;

    const normalizedStatus = typeof status === 'string' ? status.trim() : '';

    // Public catalog defaults to active products. Admin can request status=all.
    const filter = {};
    if (!normalizedStatus) {
      filter.status = 'Active';
    } else if (normalizedStatus.toLowerCase() !== 'all') {
      filter.status = normalizedStatus;
    }

    // Add category filter only if provided and not empty
    if (categoryId && categoryId.trim()) {
      filter.categoryId = categoryId.trim();
    }

    // Add subcategory filter only if provided and not empty
    if (subcategoryId && subcategoryId.trim()) {
      filter.subcategoryId = subcategoryId.trim();
    } else if (mainSubcategoryId && mainSubcategoryId.trim()) {
      const mainId = mainSubcategoryId.trim();
      const relatedSubcategories = await Subcategory.find({
        $or: [{ _id: mainId }, { parentSubcategoryId: mainId }],
      })
        .select('_id')
        .lean();

      const relatedSubcategoryIds = relatedSubcategories.map((sub) => sub._id);
      if (relatedSubcategoryIds.length === 0) {
        return res.status(200).json({
          data: [],
          totalItems: 0,
          totalPages: 0,
          currentPage: 1,
          limit: limit || 12,
        });
      }

      filter.subcategoryId = { $in: relatedSubcategoryIds };
    }

    // Add text search only if provided and not empty
    if (q && q.trim()) {
      filter.$text = { $search: q.trim() };
    }

    // Handle variant-based filtering (size, price range, availability)
    if (size || priceMin || priceMax || availability) {
      const variantFilter = {};
      
      if (size && size.trim()) {
        variantFilter.size = size.trim();
      }
      
      if (availability && availability.trim()) {
        variantFilter.availability = availability.trim();
      }
      
      if (priceMin || priceMax) {
        variantFilter.price = {};
        if (priceMin && !isNaN(priceMin)) {
          variantFilter.price.$gte = Number(priceMin);
        }
        if (priceMax && !isNaN(priceMax)) {
          variantFilter.price.$lte = Number(priceMax);
        }
      }

      // Only query variants if we have actual filters
      if (Object.keys(variantFilter).length > 0) {
        const variants = await Variant.find(variantFilter).select('productId').lean();
        const productIds = [...new Set(variants.map((v) => v.productId))];
        
        if (productIds.length === 0) {
          // No variants match - return empty result
          return res.status(200).json({ 
            data: [], 
            totalItems: 0,
            totalPages: 0,
            currentPage: 1,
            limit: limit || 12
          });
        }
        
        filter._id = { $in: productIds };
      }
    }

    const pageSize = limit || 12;
    const pageSkip = skip || 0;
    const currentPage = Math.floor(pageSkip / pageSize) + 1;

    // Handle best-selling sort
    if (sort === 'best-selling') {
      // Try featured best-selling products first
      const featuredFilter = { ...filter, featuredBestSelling: true };
      const featuredCount = await Product.countDocuments(featuredFilter);
      
      if (featuredCount > 0) {
        const [curated, total] = await Promise.all([
          Product.find(featuredFilter)
            .sort({ updatedAt: -1 })
            .skip(pageSkip)
            .limit(pageSize)
            .lean(),
          Product.countDocuments(featuredFilter)
        ]);

        return res.status(200).json({ 
          data: curated, 
          totalItems: total,
          totalPages: Math.ceil(total / pageSize),
          currentPage,
          limit: pageSize
        });
      }

      // Fallback to actual sales data
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
        { $limit: 500 }, // Reasonable limit for performance
      ]);

      const rankedIds = topSelling.map((item) => item._id);
      
      if (rankedIds.length === 0) {
        // No sales data - fallback to recent products
        const [products, total] = await Promise.all([
          Product.find(filter)
            .sort({ createdAt: -1 })
            .skip(pageSkip)
            .limit(pageSize)
            .lean(),
          Product.countDocuments(filter)
        ]);

        return res.status(200).json({ 
          data: products, 
          totalItems: total,
          totalPages: Math.ceil(total / pageSize),
          currentPage,
          limit: pageSize
        });
      }

      // Fetch products matching the ranked IDs
      const products = await Product.find({
        ...filter,
        _id: { $in: rankedIds },
      }).lean();

      // Sort products by sales rank
      const rankedProducts = rankedIds
        .map((id) => products.find((p) => p._id.toString() === id.toString()))
        .filter(Boolean);

      // Apply pagination to ranked results
      const pagedProducts = rankedProducts.slice(pageSkip, pageSkip + pageSize);
      const total = rankedProducts.length;

      return res.status(200).json({ 
        data: pagedProducts, 
        totalItems: total,
        totalPages: Math.ceil(total / pageSize),
        currentPage,
        limit: pageSize
      });
    }

    // Handle recent/new sort
    if (sort === 'recent' || sort === 'new') {
      // Try featured recent products first
      const featuredFilter = { ...filter, featuredRecent: true };
      const featuredCount = await Product.countDocuments(featuredFilter);
      
      if (featuredCount > 0) {
        const [curated, total] = await Promise.all([
          Product.find(featuredFilter)
            .sort({ updatedAt: -1 })
            .skip(pageSkip)
            .limit(pageSize)
            .lean(),
          Product.countDocuments(featuredFilter)
        ]);

        return res.status(200).json({ 
          data: curated, 
          totalItems: total,
          totalPages: Math.ceil(total / pageSize),
          currentPage,
          limit: pageSize
        });
      }
    }

    // Determine sort order
    const sortBy = (() => {
      if (sort === 'price:asc') return { price: 1 };
      if (sort === 'price:desc') return { price: -1 };
      if (sort === 'recent' || sort === 'new') return { createdAt: -1 };
      return { createdAt: -1 }; // Default sort
    })();

    // Execute query with pagination
    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort(sortBy)
        .skip(pageSkip)
        .limit(pageSize)
        .lean(),
      Product.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return res.status(200).json({ 
      data: products, 
      totalItems: total,
      totalPages,
      currentPage,
      limit: pageSize
    });
  } catch (error) {
    console.error('List products error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    // Read-only path: auto-variant sync happens on write paths (create/update,
    // cart-add, variant changes), so product detail reads stay side-effect free
    // and cacheable. Run product + variant fetch in parallel.
    const [product, variants] = await Promise.all([
      Product.findById(id).lean(),
      Variant.find({ productId: id }).lean(),
    ]);
    if (!product) return res.status(404).json({ message: 'Product not found' });
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
    if (updates.sellingPrice !== undefined || updates.price !== undefined) {
      const nextSellingPrice =
        updates.sellingPrice !== undefined && updates.sellingPrice !== null && String(updates.sellingPrice).trim() !== ''
          ? Number(updates.sellingPrice)
          : Number(updates.price);
      if (Number.isNaN(nextSellingPrice)) {
        return res.status(400).json({ message: 'sellingPrice must be a valid number' });
      }
      updates.sellingPrice = nextSellingPrice;
      updates.price = nextSellingPrice;
    }
    if (updates.regularPrice !== undefined) {
      if (updates.regularPrice === null || String(updates.regularPrice).trim() === '') {
        updates.regularPrice = undefined;
      } else {
        const nextRegularPrice = Number(updates.regularPrice);
        if (Number.isNaN(nextRegularPrice)) {
          return res.status(400).json({ message: 'regularPrice must be a valid number' });
        }
        updates.regularPrice = nextRegularPrice;
      }
    }
    if (updates.featuredBestSelling !== undefined) {
      updates.featuredBestSelling = Boolean(updates.featuredBestSelling);
    }
    if (updates.featuredRecent !== undefined) {
      updates.featuredRecent = Boolean(updates.featuredRecent);
    }
    if (updates.featuredVariantIds !== undefined) {
      updates.featuredVariantIds = Array.isArray(updates.featuredVariantIds) ? updates.featuredVariantIds : [];
    }
    if (updates.shippingCost !== undefined) {
      if (updates.shippingCost === null || String(updates.shippingCost).trim() === '') {
        updates.shippingCost = 0;
      } else {
        const nextShippingCost = Number(updates.shippingCost);
        if (!Number.isFinite(nextShippingCost) || nextShippingCost < 0) {
          return res.status(400).json({ message: 'shippingCost must be a non-negative number' });
        }
        updates.shippingCost = nextShippingCost;
      }
    }

    const product = await Product.findByIdAndUpdate(id, updates, { new: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    await syncAutoVariantForProduct(product);
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
      status: 'Active', // Only recommend active products
      $or: [
        { categoryId: product.categoryId },
        { tags: { $in: product.tags || [] } },
      ],
    })
    .limit(12)
    .lean();

    res.status(200).json(recommendations);
  } catch (error) {
    console.error('Recommend products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
