import crypto from 'crypto';

// Second credential layer for the system monitor, on top of the admin JWT.
// Credentials live only in .env:
//   SUPER_ADMIN_USER=<username>
//   SUPER_ADMIN_PASS=<password>
// The client sends them base64-encoded in one header:
//   x-super-auth: base64("user:pass")
// Read lazily (not at import time) so dotenv load order can't break it.

// Hash before comparing so timingSafeEqual gets equal-length buffers and the
// comparison leaks nothing about value length or content.
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

export const superAdminGuard = (req, res, next) => {
  const expectedUser = process.env.SUPER_ADMIN_USER || '';
  const expectedPass = process.env.SUPER_ADMIN_PASS || '';

  // Fail closed: if the credentials aren't configured, nobody gets in.
  if (!expectedUser || !expectedPass) {
    return res.status(503).json({
      message: 'System monitor is not configured. Set SUPER_ADMIN_USER and SUPER_ADMIN_PASS.',
    });
  }

  const header = String(req.get('x-super-auth') || '');
  if (!header) {
    return res.status(401).json({ message: 'Super admin credentials required' });
  }

  let user = '';
  let pass = '';
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) throw new Error('bad format');
    user = decoded.slice(0, separatorIndex);
    pass = decoded.slice(separatorIndex + 1);
  } catch {
    return res.status(401).json({ message: 'Invalid super admin credentials' });
  }

  if (!safeEqual(user, expectedUser) || !safeEqual(pass, expectedPass)) {
    return res.status(401).json({ message: 'Invalid super admin credentials' });
  }

  next();
};
