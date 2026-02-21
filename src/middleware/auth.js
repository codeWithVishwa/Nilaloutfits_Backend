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
      console.log('No token provided');
      return res.status(401).json({ message: 'Not authorized - No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      console.log('User not found for token:', decoded.id);
      return res.status(401).json({ message: 'Not authorized - User not found' });
    }

    const basePermissions = ROLE_PERMISSIONS[user.role] || [];
    const extraPermissions = user.permissions || [];
    req.user = user;
    req.userPermissions = new Set([...basePermissions, ...extraPermissions]);
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Not authorized - Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Not authorized - Token expired' });
    }
    return res.status(401).json({ message: 'Not authorized' });
  }
};

export const authorize = (permission) => (req, res, next) => {
  if (!req.userPermissions || !req.userPermissions.has(permission)) {
    console.log('Permission denied:', permission, 'User permissions:', Array.from(req.userPermissions || []));
    return res.status(403).json({ message: `Forbidden - Missing permission: ${permission}` });
  }
  next();
};

export const authorizeRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
};

export const protectOptional = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;

    if (!tokenFromHeader) {
      req.user = null;
      req.userPermissions = new Set();
      return next();
    }

    const decoded = jwt.verify(tokenFromHeader, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      req.user = null;
      req.userPermissions = new Set();
      return next();
    }

    const basePermissions = ROLE_PERMISSIONS[user.role] || [];
    const extraPermissions = user.permissions || [];
    req.user = user;
    req.userPermissions = new Set([...basePermissions, ...extraPermissions]);
    return next();
  } catch {
    req.user = null;
    req.userPermissions = new Set();
    return next();
  }
};
