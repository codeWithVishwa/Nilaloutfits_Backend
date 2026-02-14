import mongoose from 'mongoose';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import Variant from '../models/Variant.js';

const getPopulatedCart = async (userId) => {
  return Cart.findOne({ userId })
    .populate('items.productId', 'title images brand')
    .populate('items.variantId', 'size color sku price');
};

export const getCart = async (req, res) => {
  try {
    const cart = await getPopulatedCart(req.user._id);
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
      const defaultVariant = await Variant.findOne({
        productId,
        availability: 'InStock',
        stock: { $gt: 0 },
      }).sort({ stock: -1, price: 1, size: 1 });

      if (defaultVariant) {
        resolvedVariantId = defaultVariant._id;
      } else {
        const variantCount = await Variant.countDocuments({ productId });
        if (variantCount > 0) {
          return res.status(400).json({ message: 'No in-stock variant available for this product' });
        }

        const product = await Product.findById(productId).select('price stock');
        if (!product) {
          return res.status(404).json({ message: 'Product not found' });
        }
        if (product.stock <= 0) {
          return res.status(400).json({ message: 'No in-stock variant available for this product' });
        }

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
            resolvedVariantId = existingVariant._id;
          } else {
            throw error;
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

    if (!variant || variant.stock < quantity) {
      return res.status(400).json({ message: 'Insufficient stock' });
    }

    const existing = await Cart.findOne({ userId: req.user._id, 'items.variantId': resolvedVariantId });

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

    cart = await getPopulatedCart(req.user._id);
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
      const cart = await getPopulatedCart(req.user._id);
      return res.status(200).json(cart || { userId: req.user._id, items: [] });
    }

    const variant = await Variant.findById(variantId);
    if (!variant || variant.stock < quantity) {
      return res.status(400).json({ message: 'Insufficient stock' });
    }

    await Cart.findOneAndUpdate(
      { userId: req.user._id, 'items.variantId': variantId },
      { $set: { 'items.$.quantity': quantity, 'items.$.priceSnapshot': variant.price } },
      { new: true }
    );
    const cart = await getPopulatedCart(req.user._id);
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
    const cart = await getPopulatedCart(req.user._id);
    res.status(200).json(cart || { userId: req.user._id, items: [] });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
