import mongoose from 'mongoose';
import Cart from '../models/Cart.js';
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
    if (!productId || !variantId || !quantity) {
      return res.status(400).json({ message: 'productId, variantId, quantity are required' });
    }

    const variant = await Variant.findById(variantId);
    if (!variant || variant.stock < quantity) {
      return res.status(400).json({ message: 'Insufficient stock' });
    }

    const existing = await Cart.findOne({ userId: req.user._id, 'items.variantId': variantId });

    let cart;
    if (existing) {
      await Cart.findOneAndUpdate(
        { userId: req.user._id, 'items.variantId': variantId },
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
              variantId,
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
