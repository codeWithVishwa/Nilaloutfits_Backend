import crypto from 'crypto';
import { normalizeIp } from './ipBlock.js';

// Second credential layer for the system monitor, on top of the admin JWT.
// Credentials live only in .env:
//   SUPER_ADMIN_USER=<username>
//   SUPER_ADMIN_PASS=<password>
// The client sends them base64-encoded in one header:
//   x-super-auth: base64("user:pass")
//
// Optional hard control (strongest):
//   SYSTEM_MONITOR_ALLOWED_IPS=1.2.3.4,5.6.7.8   # if set, only these IPs pass
//
// Everything is read lazily so dotenv load order can't break it.
//
// IMPORTANT: any failure responds with 404, identical to a non-existent route,
// so the endpoints are invisible to scanners — an attacker can't even confirm
// the system monitor exists without the exact credentials (and allowed IP).

// Hash before comparing so timingSafeEqual gets equal-length buffers and the
// comparison leaks nothing about value length or content.
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

// Respond exactly like an unmatched route. No hint that anything protected lives
// here. (Kept JSON to match the API's content type.)
const notFound = (res) => res.status(404).json({ message: 'Not found' });

const getAllowedIps = () =>
  String(process.env.SYSTEM_MONITOR_ALLOWED_IPS || '')
    .split(',')
    .map((ip) => normalizeIp(ip))
    .filter(Boolean);

export const superAdminGuard = (req, res, next) => {
  // 1. Optional IP allowlist — fail (hidden) before doing anything else.
  const allowedIps = getAllowedIps();
  if (allowedIps.length > 0 && !allowedIps.includes(normalizeIp(req.ip))) {
    return notFound(res);
  }

  const expectedUser = process.env.SUPER_ADMIN_USER || '';
  const expectedPass = process.env.SUPER_ADMIN_PASS || '';

  // 2. Fail closed: if credentials aren't configured, behave as not-found and
  //    warn server-side so the operator can spot the misconfiguration in logs.
  if (!expectedUser || !expectedPass) {
    console.warn('[system-monitor] blocked: SUPER_ADMIN_USER/SUPER_ADMIN_PASS not configured');
    return notFound(res);
  }

  // 3. Credentials check.
  const header = String(req.get('x-super-auth') || '');
  if (!header) return notFound(res);

  let user = '';
  let pass = '';
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) throw new Error('bad format');
    user = decoded.slice(0, separatorIndex);
    pass = decoded.slice(separatorIndex + 1);
  } catch {
    return notFound(res);
  }

  if (!safeEqual(user, expectedUser) || !safeEqual(pass, expectedPass)) {
    return notFound(res);
  }

  next();
};
