import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import Payment from '../models/Payment.js';
import Variant from '../models/Variant.js';

export const getDashboardMetrics = async (req, res) => {
  try {
    const [orderCount, productCount, userCount] = await Promise.all([
      Order.countDocuments(),
      Product.countDocuments(),
      User.countDocuments(),
    ]);

    const revenueAgg = await Order.aggregate([
      {
        $match: {
          status: { $ne: 'Cancelled' },
          $or: [{ paymentStatus: 'Paid' }, { paymentMethod: 'COD' }],
        },
      },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);

    const revenue = revenueAgg[0]?.total || 0;

    res.status(200).json({ orderCount, productCount, userCount, revenue });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const listUsers = async (req, res) => {
  try {
    const { q } = req.query;
    const filter = {};
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .select('-password -resetPasswordToken -resetPasswordExpires -emailVerifyToken -emailVerifyExpires')
      .sort({ createdAt: -1 });

    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, permissions, isEmailVerified } = req.body;

    const updates = {};
    if (role) updates.role = role;
    if (Array.isArray(permissions)) updates.permissions = permissions;
    if (typeof isEmailVerified === 'boolean') updates.isEmailVerified = isEmailVerified;

    const user = await User.findByIdAndUpdate(id, updates, { new: true })
      .select('-password -resetPasswordToken -resetPasswordExpires -emailVerifyToken -emailVerifyExpires');

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const listPayments = async (req, res) => {
  try {
    const payments = await Payment.find().sort({ createdAt: -1 });
    res.status(200).json(payments);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const listVariants = async (req, res) => {
  try {
    const variants = await Variant.find().sort({ createdAt: -1 });
    res.status(200).json(variants);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const listGroupedProducts = async (req, res) => {
  try {
    const grouped = await Product.aggregate([
      {
        $match: { status: 'Active' }
      },
      {
        $group: {
          _id: '$title',
          productIds: { $push: '$_id' },
          count: { $sum: 1 },
          image: { $first: { $arrayElemAt: ['$images', 0] } },
          price: { $first: '$price' },
          categoryId: { $first: '$categoryId' },
          brand: { $first: '$brand' }
        }
      },
      {
        $project: {
          _id: 0,
          title: '$_id',
          productIds: 1,
          count: 1,
          image: 1,
          price: 1,
          categoryId: 1,
          brand: 1
        }
      },
      {
        $sort: { count: -1, title: 1 }
      }
    ]);

    res.status(200).json(grouped);
  } catch (error) {
    console.error('List grouped products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
