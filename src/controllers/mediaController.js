export const uploadMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File is required' });
    }

    const rawPath = req.file.path || '';
    const normalizedPath = rawPath.replace(/\\/g, '/');
    const url = `${req.protocol}://${req.get('host')}/${normalizedPath}`;
    res.status(200).json({ url });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
