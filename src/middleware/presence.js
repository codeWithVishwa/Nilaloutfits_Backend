// Lightweight IP-based presence tracking for the admin "online users" metric.
// Every /api request stamps its client IP with a last-seen time; an IP counts
// as online while it was seen within the activity window. In-memory only —
// fine for a single instance, and presence data is inherently ephemeral.

const lastSeenByIp = new Map();

const ONLINE_WINDOW_MS = 5 * 60 * 1000; // "online" = active in the last 5 minutes
const SWEEP_INTERVAL_MS = 60 * 1000;
const MAX_TRACKED_IPS = 50_000; // hard memory cap under abusive traffic

// Drop entries idle past the largest reporting window (15m) so the map can't
// grow unbounded. unref() keeps the timer from holding the process open.
const sweep = () => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [ip, seenAt] of lastSeenByIp) {
    if (seenAt < cutoff) lastSeenByIp.delete(ip);
  }
};
setInterval(sweep, SWEEP_INTERVAL_MS).unref();

export const presenceTracker = (req, res, next) => {
  const ip = req.ip;
  if (ip && (lastSeenByIp.size < MAX_TRACKED_IPS || lastSeenByIp.has(ip))) {
    lastSeenByIp.set(ip, Date.now());
  }
  next();
};

const countSince = (windowMs) => {
  const cutoff = Date.now() - windowMs;
  let count = 0;
  for (const seenAt of lastSeenByIp.values()) {
    if (seenAt >= cutoff) count += 1;
  }
  return count;
};

export const getOnlineStats = () => ({
  onlineNow: countSince(ONLINE_WINDOW_MS),
  windowMinutes: ONLINE_WINDOW_MS / 60_000,
  activeLast1m: countSince(60 * 1000),
  activeLast15m: countSince(15 * 60 * 1000),
  trackedIps: lastSeenByIp.size,
  generatedAt: new Date().toISOString(),
});
