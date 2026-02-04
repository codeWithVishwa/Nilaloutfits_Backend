import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';

export const getDashboardMetrics = async (req, res) => {
  try {
    const [orderCount, productCount, userCount] = await Promise.all([
      Order.countDocuments(),
      Product.countDocuments(),
      User.countDocuments(),
    ]);

    const revenueAgg = await Order.aggregate([
      { $match: { paymentStatus: 'Paid' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);

    const revenue = revenueAgg[0]?.total || 0;

    res.status(200).json({ orderCount, productCount, userCount, revenue });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
