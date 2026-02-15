import Wishlist from '../models/Wishlist.js';
import mongoose from 'mongoose';

const getPopulatedWishlist = async (userId) => {
  return Wishlist.findOne({ userId }).populate('items.productId', 'title images brand price stock');
};

export const getWishlist = async (req, res) => {
  try {
    console.log('Get wishlist - User ID:', req.user._id);
    const wishlist = await getPopulatedWishlist(req.user._id);
    console.log('Wishlist found:', wishlist ? 'Yes' : 'No');
    res.status(200).json(wishlist || { userId: req.user._id, items: [] });
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

export const addToWishlist = async (req, res) => {
  try {
    const { productId, preferredVariantId } = req.body;
    console.log('Add to wishlist - User ID:', req.user._id, 'Product ID:', productId);
    
    if (!productId) {
      console.log('Missing productId');
      return res.status(400).json({ message: 'productId is required' });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      console.log('Invalid productId format:', productId);
      return res.status(400).json({ message: 'Invalid product ID format' });
    }

    // Check if product already exists in wishlist
    const existingWishlist = await Wishlist.findOne({ 
      userId: req.user._id, 
      'items.productId': productId 
    });

    if (existingWishlist) {
      console.log('Product already in wishlist');
      const wishlist = await getPopulatedWishlist(req.user._id);
      return res.status(200).json(wishlist || { userId: req.user._id, items: [] });
    }

    // Add to wishlist
    console.log('Adding product to wishlist');
    await Wishlist.findOneAndUpdate(
      { userId: req.user._id },
      { $push: { items: { productId, preferredVariantId } } },
      { new: true, upsert: true }
    );

    const wishlist = await getPopulatedWishlist(req.user._id);
    console.log('Wishlist updated successfully');
    res.status(200).json(wishlist || { userId: req.user._id, items: [] });
  } catch (error) {
    console.error('Add to wishlist error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    if (error.stack) console.error('Error stack:', error.stack);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

export const removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    console.log('Remove from wishlist - User ID:', req.user._id, 'Product ID:', productId);
    
    if (!productId) {
      console.log('Missing productId');
      return res.status(400).json({ message: 'productId is required' });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      console.log('Invalid productId format:', productId);
      return res.status(400).json({ message: 'Invalid product ID format' });
    }

    const result = await Wishlist.findOneAndUpdate(
      { userId: req.user._id },
      { $pull: { items: { productId } } },
      { new: true }
    );

    if (!result) {
      console.log('Wishlist not found for user');
      // Don't return error, just return empty wishlist
      return res.status(200).json({ userId: req.user._id, items: [] });
    }

    const wishlist = await getPopulatedWishlist(req.user._id);
    console.log('Product removed from wishlist successfully');
    res.status(200).json(wishlist || { userId: req.user._id, items: [] });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    if (error.stack) console.error('Error stack:', error.stack);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};
