export const uploadMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File is required' });
    }

    const rawUrl = req.file.path || req.file.secure_url;
    const url = rawUrl?.startsWith('uploads')
      ? `${req.protocol}://${req.get('host')}/${rawUrl.replace(/\\/g, '/')}`
      : rawUrl;
    res.status(200).json({ url });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
