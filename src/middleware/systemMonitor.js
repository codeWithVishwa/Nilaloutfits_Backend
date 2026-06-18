// Lightweight in-process traffic + health sampling for the admin system monitor.
// Everything here is O(1) per request and bounded in memory.

import { createLatencyTracker } from '../utils/latency.js';

const BUCKET_COUNT = 15; // keep the last 15 one-minute buckets
const MAX_TRACKED_PATHS = 300;

// Server-side processing time per API request (avg / p95 / slow count).
const responseLatency = createLatencyTracker({ sampleSize: 500, slowMs: 500 });

const minuteBuckets = new Map(); // minuteKey -> { total, s2xx, s3xx, s4xx, s5xx }
const pathCounts = new Map(); // normalized path -> count (since boot)
let totalRequests = 0;
const bootedAt = Date.now();

const currentMinuteKey = () => Math.floor(Date.now() / 60_000);

const pruneBuckets = () => {
  const oldest = currentMinuteKey() - BUCKET_COUNT;
  for (const key of minuteBuckets.keys()) {
    if (key < oldest) minuteBuckets.delete(key);
  }
};

// Collapse ids so path cardinality stays bounded: /api/products/64ab... ->
// /api/products/:id. Keeps the report readable too.
const normalizePath = (path) =>
  String(path || '')
    .split('?')[0]
    .replace(/\/[0-9a-f]{24}(?=\/|$)/gi, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:n')
    .slice(0, 120);

export const trafficTracker = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    totalRequests += 1;
    responseLatency.record(Number(process.hrtime.bigint() - startedAt) / 1e6);

    const key = currentMinuteKey();
    let bucket = minuteBuckets.get(key);
    if (!bucket) {
      bucket = { total: 0, s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0 };
      minuteBuckets.set(key, bucket);
      pruneBuckets();
    }
    bucket.total += 1;
    const cls = Math.floor(res.statusCode / 100);
    if (cls === 2) bucket.s2xx += 1;
    else if (cls === 3) bucket.s3xx += 1;
    else if (cls === 4) bucket.s4xx += 1;
    else if (cls === 5) bucket.s5xx += 1;

    const path = normalizePath(req.originalUrl || req.url);
    if (pathCounts.has(path) || pathCounts.size < MAX_TRACKED_PATHS) {
      pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
    }
  });
  next();
};

// Event-loop lag: how late a 1s timer fires. A loaded/blocked Node process
// shows up here long before requests start failing.
let eventLoopLagMs = 0;
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  eventLoopLagMs = Math.max(0, now - lastTick - 1000);
  lastTick = now;
}, 1000).unref();

export const getTrafficStats = () => {
  pruneBuckets();
  const nowKey = currentMinuteKey();

  const perMinute = [];
  const totals = { total: 0, s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0 };
  for (let i = BUCKET_COUNT - 1; i >= 0; i -= 1) {
    const key = nowKey - i;
    const bucket = minuteBuckets.get(key) || { total: 0, s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0 };
    perMinute.push({ minutesAgo: i, ...bucket });
    totals.total += bucket.total;
    totals.s2xx += bucket.s2xx;
    totals.s3xx += bucket.s3xx;
    totals.s4xx += bucket.s4xx;
    totals.s5xx += bucket.s5xx;
  }

  const topPaths = [...pathCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  return {
    requestsLast15m: totals,
    perMinute,
    topPaths,
    totalRequestsSinceBoot: totalRequests,
    bootedAt: new Date(bootedAt).toISOString(),
  };
};

export const getEventLoopLagMs = () => eventLoopLagMs;

export const getApiResponseStats = () => responseLatency.stats();
