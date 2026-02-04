import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { ROLE_PERMISSIONS } from '../config/roles.js';

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;

    const token = tokenFromHeader;

    if (!token) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const basePermissions = ROLE_PERMISSIONS[user.role] || [];
    const extraPermissions = user.permissions || [];
    req.user = user;
    req.userPermissions = new Set([...basePermissions, ...extraPermissions]);
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized' });
  }
};

export const authorize = (permission) => (req, res, next) => {
  if (!req.userPermissions || !req.userPermissions.has(permission)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
};
