import Review from '../models/Review.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';

export const createReview = async (req, res) => {
  try {
    const { orderId, variantId, rating, comment } = req.body;
    if (!orderId || !variantId || !rating) {
      return res.status(400).json({ message: 'orderId, variantId, rating are required' });
    }

    const order = await Order.findOne({ _id: orderId, userId: req.user._id });
    if (!order || order.status !== 'Delivered') {
      return res.status(400).json({ message: 'Only delivered orders can be reviewed' });
    }

    const orderItem = order.items.find((i) => i.variantId.toString() === variantId);
    if (!orderItem) {
      return res.status(400).json({ message: 'Order item not found' });
    }

    const review = await Review.create({
      userId: req.user._id,
      productId: orderItem.productId,
      variantId: orderItem.variantId,
      orderId: order._id,
      rating,
      comment,
    });

    const stats = await Review.aggregate([
      { $match: { productId: orderItem.productId } },
      { $group: { _id: '$productId', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);

    if (stats.length > 0) {
      await Product.findByIdAndUpdate(orderItem.productId, {
        avgRating: stats[0].avgRating,
        ratingCount: stats[0].count,
      });
    }

    res.status(201).json(review);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Review already exists for this item' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

export const listProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const reviews = await Review.find({ productId }).sort({ createdAt: -1 });
    res.status(200).json(reviews);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
