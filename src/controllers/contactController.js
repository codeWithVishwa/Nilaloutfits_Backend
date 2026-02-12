import ContactMessage from '../models/ContactMessage.js';
import { getPagination } from '../utils/pagination.js';

export const createContactMessage = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: 'Name, email, subject, and message are required' });
    }

    const contactMessage = await ContactMessage.create({
      name,
      email,
      phone,
      subject,
      message,
    });

    return res.status(201).json(contactMessage);
  } catch (error) {
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: error?.message || 'Server error' });
  }
};

export const listContactMessages = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { q, status } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { subject: { $regex: q, $options: 'i' } },
        { message: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
      ];
    }

    const [totalCount, messages] = await Promise.all([
      ContactMessage.countDocuments(filter),
      ContactMessage.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / limit);

    return res.status(200).json({
      data: messages,
      pagination: {
        page,
        limit,
        totalPages,
        totalCount,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error?.message || 'Server error' });
  }
};
