import mongoose from 'mongoose';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import Variant from '../models/Variant.js';
import { syncAutoVariantForProduct } from '../utils/defaultVariant.js';

const getPopulatedCart = async (userId) => {
  return Cart.findOne({ userId })
    .populate('items.productId', 'title images brand')
    .populate('items.variantId', 'size color sku price stock');
};

// Returns the populated cart with orphaned items removed. An item is orphaned
// when its product or variant has been deleted (e.g. admin removed the product),
// which makes the populated ref null. Such items can't be priced or removed by
// the client, so we prune them from storage and return a clean cart. Pruning
// only runs when an orphan is actually present, so the common path stays cheap.
const getCleanCart = async (userId) => {
  const cart = await getPopulatedCart(userId);
  if (!cart || !cart.items.length) return cart;

  const hasOrphan = cart.items.some((item) => !item.productId || !item.variantId);
  if (!hasOrphan) return cart;

  const rawCart = await Cart.findOne({ userId });
  if (rawCart) {
    // Populated items align by index with the stored items array.
    rawCart.items = rawCart.items.filter((_, idx) => {
      const populated = cart.items[idx];
      return populated && populated.productId && populated.variantId;
    });
    await rawCart.save();
  }
  return getPopulatedCart(userId);
};

export const getCart = async (req, res) => {
  try {
    const cart = await getCleanCart(req.user._id);
    res.status(200).json(cart || { userId: req.user._id, items: [] });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const addToCart = async (req, res) => {
  try {
    const { productId, variantId, quantity } = req.body;
    if (!productId || !quantity) {
      return res.status(400).json({ message: 'productId and quantity are required' });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: 'Invalid productId' });
    }

    let resolvedVariantId = variantId;
    if (!resolvedVariantId) {
      await syncAutoVariantForProduct(productId);
      const defaultVariant = await Variant.findOne({
        productId,
        availability: 'InStock',
        stock: { $gt: 0 },
      }).sort({ stock: -1, price: 1, size: 1 });

      if (defaultVariant) {
        resolvedVariantId = defaultVariant._id;
      } else {
        const product = await Product.findById(productId).select('price stock');
        if (!product) {
          return res.status(404).json({ message: 'Product not found' });
        }

        const [oneSizeVariant, hasRealVariants] = await Promise.all([
          Variant.findOne({ productId, size: 'ONE_SIZE' }),
          Variant.exists({ productId, size: { $ne: 'ONE_SIZE' } }),
        ]);

        if (hasRealVariants) {
          return res.status(400).json({ message: 'No in-stock variant available for this product' });
        }
        if (Number(product.stock || 0) <= 0) {
          return res.status(400).json({ message: 'No in-stock variant available for this product' });
        }

        if (oneSizeVariant) {
          oneSizeVariant.price = product.price;
          oneSizeVariant.stock = Number(product.stock || 0);
          oneSizeVariant.availability = oneSizeVariant.stock > 0 ? 'InStock' : 'OutOfStock';
          await oneSizeVariant.save();
          resolvedVariantId = oneSizeVariant._id;
        } else {
          try {
            const createdVariant = await Variant.create({
              productId,
              size: 'ONE_SIZE',
              sku: `AUTO-${productId}`.toUpperCase(),
              price: product.price,
              stock: product.stock,
              availability: 'InStock',
            });
            resolvedVariantId = createdVariant._id;
          } catch (error) {
            if (error?.code === 11000) {
              const existingVariant = await Variant.findOne({ productId, size: 'ONE_SIZE' });
              if (!existingVariant) {
                return res.status(500).json({ message: 'Server error' });
              }

              existingVariant.price = product.price;
              existingVariant.stock = Number(product.stock || 0);
              existingVariant.availability = existingVariant.stock > 0 ? 'InStock' : 'OutOfStock';
              await existingVariant.save();
              resolvedVariantId = existingVariant._id;
            } else {
              throw error;
            }
          }
        }
      }
    }

    if (!mongoose.Types.ObjectId.isValid(resolvedVariantId)) {
      return res.status(400).json({ message: 'Invalid variantId' });
    }

    const variant = await Variant.findById(resolvedVariantId);
    if (!variant || variant.productId.toString() !== productId.toString()) {
      return res.status(400).json({ message: 'Variant does not belong to this product' });
    }

    const existing = await Cart.findOne({ userId: req.user._id, 'items.variantId': resolvedVariantId });
    const existingItem = existing?.items?.find(
      (item) => String(item.variantId) === String(resolvedVariantId)
    );
    const currentQuantity = Number(existingItem?.quantity || 0);
    const requestedQuantity = Number(quantity || 0);
    const totalRequestedQuantity = currentQuantity + requestedQuantity;

    if (!variant || variant.stock < totalRequestedQuantity) {
      const availableStock = Number(variant?.stock || 0);
      return res.status(400).json({
        message: `Only ${availableStock} unit${availableStock === 1 ? '' : 's'} are available for this product.`,
        availableStock,
      });
    }

    let cart;
    if (existing) {
      await Cart.findOneAndUpdate(
        { userId: req.user._id, 'items.variantId': resolvedVariantId },
        { $inc: { 'items.$.quantity': quantity }, $set: { 'items.$.priceSnapshot': variant.price } },
        { new: true }
      );
    } else {
      await Cart.findOneAndUpdate(
        { userId: req.user._id },
        {
          $push: {
            items: {
              productId,
              variantId: resolvedVariantId,
              quantity,
              priceSnapshot: variant.price,
            },
          },
        },
        { new: true, upsert: true }
      );
    }

    cart = await getCleanCart(req.user._id);
    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateCartItem = async (req, res) => {
  try {
    const { variantId, quantity } = req.body;
    if (!variantId || quantity === undefined || quantity === null) {
      return res.status(400).json({ message: 'variantId and quantity are required' });
    }

    if (!mongoose.Types.ObjectId.isValid(variantId)) {
      return res.status(400).json({ message: 'Invalid variantId' });
    }

    if (quantity <= 0) {
      await Cart.findOneAndUpdate(
        { userId: req.user._id },
        { $pull: { items: { variantId } } },
        { new: true }
      );
      const cart = await getCleanCart(req.user._id);
      return res.status(200).json(cart || { userId: req.user._id, items: [] });
    }

    const variant = await Variant.findById(variantId);
    if (!variant || variant.stock < quantity) {
      const availableStock = Number(variant?.stock || 0);
      return res.status(400).json({
        message: `Only ${availableStock} unit${availableStock === 1 ? '' : 's'} are available for this product.`,
        availableStock,
      });
    }

    await Cart.findOneAndUpdate(
      { userId: req.user._id, 'items.variantId': variantId },
      { $set: { 'items.$.quantity': quantity, 'items.$.priceSnapshot': variant.price } },
      { new: true }
    );
    const cart = await getCleanCart(req.user._id);
    res.status(200).json(cart || { userId: req.user._id, items: [] });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const removeCartItem = async (req, res) => {
  try {
    const { variantId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(variantId)) {
      return res.status(400).json({ message: 'Invalid variantId' });
    }
    await Cart.findOneAndUpdate(
      { userId: req.user._id },
      { $pull: { items: { variantId } } },
      { new: true }
    );
    const cart = await getCleanCart(req.user._id);
    res.status(200).json(cart || { userId: req.user._id, items: [] });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
