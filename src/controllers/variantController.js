import Variant from '../models/Variant.js';
import Product from '../models/Product.js';
import { emitStockUpdate } from '../socket/index.js';

export const createVariant = async (req, res) => {
  try {
    const { productId, size, color, sku, price, stock } = req.body;
    if (!productId || !size || !sku || price === undefined || stock === undefined) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const sourceProduct = await Product.findById(productId).select('title');
    if (!sourceProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const targetProducts = await Product.find({ title: sourceProduct.title }).select('_id');
    const availability = stock > 0 ? 'InStock' : 'OutOfStock';

    const created = [];
    const skipped = [];

    for (const product of targetProducts) {
      const uniqueSku = `${sku}-${product._id}`.toUpperCase();
      try {
        const variant = await Variant.create({
          productId: product._id,
          size,
          color,
          sku: uniqueSku,
          price,
          stock,
          availability,
        });
        created.push(variant);
        emitStockUpdate(variant);
      } catch (error) {
        if (error?.code === 11000) {
          skipped.push({ productId: product._id, reason: 'Duplicate variant or SKU' });
          continue;
        }
        throw error;
      }
    }

    res.status(201).json({ created, skipped, appliedTo: targetProducts.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    if (updates.stock !== undefined) {
      updates.availability = updates.stock > 0 ? 'InStock' : 'OutOfStock';
    }

    const variant = await Variant.findByIdAndUpdate(id, updates, { new: true });
    if (!variant) return res.status(404).json({ message: 'Variant not found' });

    emitStockUpdate(variant);
    res.status(200).json(variant);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const variant = await Variant.findByIdAndDelete(id);
    if (!variant) return res.status(404).json({ message: 'Variant not found' });
    emitStockUpdate({ _id: id, deleted: true });
    res.status(200).json({ message: 'Variant deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const listVariantsByProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const variants = await Variant.find({ productId });
    res.status(200).json(variants);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const bulkCreateVariants = async (req, res) => {
  try {
    const { productIds, sizes, colors, replaceColors } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: 'productIds array is required' });
    }

    if (!Array.isArray(sizes) || sizes.length === 0) {
      return res.status(400).json({ message: 'sizes array is required' });
    }

    // Fetch all products to get their price and stock
    const products = await Product.find({ _id: { $in: productIds } }).select('_id title price stock');

    if (products.length === 0) {
      return res.status(404).json({ message: 'No products found' });
    }

    const results = {
      created: [],
      updated: [],
      skipped: []
    };

    // Support both single color (backward compatibility) and multiple colors
    const colorArray = Array.isArray(colors) && colors.length > 0 ? colors : [undefined];
    const normalizedColors = colorArray
      .filter((color) => typeof color === 'string' && color.trim().length > 0)
      .map((color) => color.trim());

    if (replaceColors && normalizedColors.length > 0) {
      await Variant.deleteMany({
        productId: { $in: productIds },
        color: { $nin: normalizedColors }
      });
    }

    // Create variants for each product, size, and color combination
    for (const product of products) {
      for (const size of sizes) {
        for (const color of colorArray) {
          const availability = product.stock > 0 ? 'InStock' : 'OutOfStock';
          
          // Generate unique SKU: TITLE-SIZE-COLOR-PRODUCTID
          const titlePrefix = product.title.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '');
          const colorSuffix = color ? `-${color.trim().substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '')}` : '';
          const productIdSuffix = product._id.toString().substring(product._id.toString().length - 8);
          const sku = `${titlePrefix}-${size.trim().toUpperCase()}${colorSuffix}-${productIdSuffix}`;

          try {
            // Check if variant already exists by productId + size + color OR by SKU
            const existingVariant = await Variant.findOne({
              $or: [
                {
                  productId: product._id,
                  size: size.trim(),
                  ...(color ? { color: color.trim() } : {})
                },
                { sku }
              ]
            });

            if (existingVariant) {
              results.skipped.push({ 
                productId: product._id, 
                size: size.trim(),
                color: color || 'N/A',
                reason: existingVariant.sku === sku ? 'SKU already exists' : 'Variant already exists'
              });
              continue;
            }

            // Create new variant
            const variant = await Variant.create({
              productId: product._id,
              size: size.trim(),
              color: color ? color.trim() : undefined,
              sku,
              price: product.price,
              stock: product.stock,
              availability
            });

            results.created.push(variant);
            emitStockUpdate(variant);
          } catch (error) {
            console.error(`Error creating variant for product ${product._id}, size ${size}, color ${color}:`, error);
            results.skipped.push({ 
              productId: product._id, 
              size: size.trim(),
              color: color || 'N/A',
              reason: error?.code === 11000 ? 'Duplicate key error' : error.message 
            });
          }
        }
      }
    }

    res.status(201).json({
      message: 'Bulk variant creation completed',
      summary: {
        totalProducts: products.length,
        totalSizes: sizes.length,
        totalColors: colorArray.filter(c => c).length || 0,
        created: results.created.length,
        updated: results.updated.length,
        skipped: results.skipped.length
      },
      results
    });
  } catch (error) {
    console.error('Bulk create variants error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
