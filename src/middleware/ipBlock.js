import BlockedIp from '../models/BlockedIp.js';

// In-memory mirror of the BlockedIp collection. Lookups are O(1) per request;
// the DB is only touched at boot and when an admin blocks/unblocks.
const blockedIps = new Set();

// req.ip for IPv4 clients often arrives as "::ffff:1.2.3.4" — normalize so the
// stored form and the runtime form always match.
export const normalizeIp = (ip) =>
  String(ip || '').trim().toLowerCase().replace(/^::ffff:/, '');

export const loadBlockedIpCache = async () => {
  const rows = await BlockedIp.find({}).select('ip').lean();
  blockedIps.clear();
  rows.forEach((row) => blockedIps.add(normalizeIp(row.ip)));
  return blockedIps.size;
};

export const isIpBlocked = (ip) => blockedIps.has(normalizeIp(ip));
export const addBlockedIpToCache = (ip) => blockedIps.add(normalizeIp(ip));
export const removeBlockedIpFromCache = (ip) => blockedIps.delete(normalizeIp(ip));
export const getBlockedIpCount = () => blockedIps.size;

// Mounted before everything else: blocked clients get a flat 403 and never
// reach parsers, rate limiters or routes.
export const ipBlockGuard = (req, res, next) => {
  if (isIpBlocked(req.ip)) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  next();
};
