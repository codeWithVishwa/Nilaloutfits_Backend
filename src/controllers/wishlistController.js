import Wishlist from '../models/Wishlist.js';

const getPopulatedWishlist = async (userId) => {
  return Wishlist.findOne({ userId }).populate('items.productId', 'title images brand price stock');
};

export const getWishlist = async (req, res) => {
  try {
    const wishlist = await getPopulatedWishlist(req.user._id);
    res.status(200).json(wishlist || { userId: req.user._id, items: [] });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const addToWishlist = async (req, res) => {
  try {
    const { productId, preferredVariantId } = req.body;
    if (!productId) return res.status(400).json({ message: 'productId is required' });

    await Wishlist.findOneAndUpdate(
      { userId: req.user._id, 'items.productId': { $ne: productId } },
      { $push: { items: { productId, preferredVariantId } } },
      { new: true, upsert: true }
    );

    const wishlist = await getPopulatedWishlist(req.user._id);
    res.status(200).json(wishlist || { userId: req.user._id, items: [] });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    await Wishlist.findOneAndUpdate(
      { userId: req.user._id },
      { $pull: { items: { productId } } },
      { new: true }
    );

    const wishlist = await getPopulatedWishlist(req.user._id);
    res.status(200).json(wishlist || { userId: req.user._id, items: [] });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
