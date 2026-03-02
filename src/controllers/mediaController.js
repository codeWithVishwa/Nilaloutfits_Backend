const buildOrigin = (req) => {
  const publicAppUrl = String(process.env.PUBLIC_APP_URL || '').trim();
  if (publicAppUrl) {
    return publicAppUrl.replace(/\/+$/, '');
  }

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim();
  const proto = forwardedProto || req.protocol || 'http';
  const host = req.get('host');

  const normalizedProto =
    proto === 'http' && /(?:^|\.)nilaloutfits\.com$/i.test(host || '')
      ? 'https'
      : proto;

  return `${normalizedProto}://${host}`;
};

export const uploadMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File is required' });
    }

    const rawPath = req.file.path || '';
    const normalizedPath = rawPath.replace(/\\/g, '/');
    const url = `${buildOrigin(req)}/${normalizedPath}`;
    res.status(200).json({ url });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
