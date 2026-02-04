import Cart from '../models/Cart.js';
import Variant from '../models/Variant.js';

export const getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user._id });
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
      cart = await Cart.findOneAndUpdate(
        { userId: req.user._id, 'items.variantId': variantId },
        { $inc: { 'items.$.quantity': quantity }, $set: { 'items.$.priceSnapshot': variant.price } },
        { new: true }
      );
    } else {
      cart = await Cart.findOneAndUpdate(
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

    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateCartItem = async (req, res) => {
  try {
    const { variantId, quantity } = req.body;
    if (!variantId || !quantity) {
      return res.status(400).json({ message: 'variantId and quantity are required' });
    }

    const variant = await Variant.findById(variantId);
    if (!variant || variant.stock < quantity) {
      return res.status(400).json({ message: 'Insufficient stock' });
    }

    const cart = await Cart.findOneAndUpdate(
      { userId: req.user._id, 'items.variantId': variantId },
      { $set: { 'items.$.quantity': quantity, 'items.$.priceSnapshot': variant.price } },
      { new: true }
    );

    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const removeCartItem = async (req, res) => {
  try {
    const { variantId } = req.params;
    const cart = await Cart.findOneAndUpdate(
      { userId: req.user._id },
      { $pull: { items: { variantId } } },
      { new: true }
    );

    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
