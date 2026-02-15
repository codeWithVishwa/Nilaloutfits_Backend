import NewsletterSubscriber from '../models/NewsletterSubscriber.js';

export const subscribeNewsletter = async (req, res) => {
  try {
    const { email, source } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    const existing = await NewsletterSubscriber.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(200).json({ message: 'You are already subscribed to Nilal Society.' });
    }

    await NewsletterSubscriber.create({
      email: normalizedEmail,
      source: String(source || 'home').trim(),
    });

    return res.status(201).json({ message: 'Subscribed successfully.' });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(200).json({ message: 'You are already subscribed to Nilal Society.' });
    }
    return res.status(500).json({ message: error?.message || 'Server error' });
  }
};

