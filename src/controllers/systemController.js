import mongoose from 'mongoose';
import { performance } from 'perf_hooks';
import net from 'net';
import BlockedIp from '../models/BlockedIp.js';
import {
  normalizeIp,
  isIpBlocked,
  addBlockedIpToCache,
  removeBlockedIpFromCache,
  getBlockedIpCount,
} from '../middleware/ipBlock.js';
import { getTrafficStats, getEventLoopLagMs } from '../middleware/systemMonitor.js';
import { getOnlineStats } from '../middleware/presence.js';

const MONGO_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

// GET /api/admin/system/health
// Server + MongoDB health. mongoPingMs is a real timed round-trip to the DB;
// the HTTP round-trip itself is the "connection ping" as seen by the caller.
export const getSystemHealth = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    let mongoPingMs = null;
    let mongoOk = false;
    if (mongoose.connection.readyState === 1) {
      const start = performance.now();
      await mongoose.connection.db.admin().command({ ping: 1 });
      mongoPingMs = Number((performance.now() - start).toFixed(1));
      mongoOk = true;
    }

    const memory = process.memoryUsage();
    res.status(200).json({
      status: mongoOk ? 'ok' : 'degraded',
      serverTime: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      eventLoopLagMs: getEventLoopLagMs(),
      memory: {
        rssMb: Number((memory.rss / 1024 / 1024).toFixed(1)),
        heapUsedMb: Number((memory.heapUsed / 1024 / 1024).toFixed(1)),
      },
      mongo: {
        state: MONGO_STATES[mongoose.connection.readyState] || 'unknown',
        pingMs: mongoPingMs,
      },
    });
  } catch (error) {
    console.error('System health error:', error);
    res.status(500).json({ status: 'error', message: 'Health check failed' });
  }
};

// GET /api/admin/system/traffic
export const getSystemTraffic = (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({
    ...getTrafficStats(),
    online: getOnlineStats(),
    blockedIpCount: getBlockedIpCount(),
  });
};

// GET /api/admin/system/blocked-ips
export const listBlockedIps = async (req, res) => {
  try {
    const items = await BlockedIp.find({})
      .sort({ createdAt: -1 })
      .populate('blockedBy', 'name email')
      .lean();
    res.set('Cache-Control', 'no-store');
    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/admin/system/blocked-ips  { ip, reason? }
export const blockIp = async (req, res) => {
  try {
    const ip = normalizeIp(req.body?.ip);
    const reason = String(req.body?.reason || '').trim();

    if (!ip || !net.isIP(ip)) {
      return res.status(400).json({ message: 'A valid IPv4 or IPv6 address is required' });
    }
    // Lockout protection: an admin can never block the IP they are calling from.
    if (ip === normalizeIp(req.ip)) {
      return res.status(400).json({ message: 'You cannot block your own IP address' });
    }
    if (isIpBlocked(ip)) {
      return res.status(409).json({ message: 'IP is already blocked' });
    }

    const entry = await BlockedIp.create({ ip, reason, blockedBy: req.user._id });
    addBlockedIpToCache(ip);
    res.status(201).json(entry);
  } catch (error) {
    if (error?.code === 11000) {
      addBlockedIpToCache(normalizeIp(req.body?.ip));
      return res.status(409).json({ message: 'IP is already blocked' });
    }
    console.error('Block IP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/admin/system/blocked-ips/:ip
export const unblockIp = async (req, res) => {
  try {
    const ip = normalizeIp(decodeURIComponent(req.params.ip || ''));
    if (!ip) return res.status(400).json({ message: 'IP is required' });

    const removed = await BlockedIp.findOneAndDelete({ ip });
    removeBlockedIpFromCache(ip);
    if (!removed) return res.status(404).json({ message: 'IP not found in blocklist' });
    res.status(200).json({ message: 'IP unblocked', ip });
  } catch (error) {
    console.error('Unblock IP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
