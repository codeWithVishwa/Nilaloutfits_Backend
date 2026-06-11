import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';

import connectDB from './src/config/db.js';
import { initSocket } from './src/socket/index.js';
import { presenceTracker } from './src/middleware/presence.js';
import { ipBlockGuard, loadBlockedIpCache } from './src/middleware/ipBlock.js';
import { trafficTracker } from './src/middleware/systemMonitor.js';
import systemRoutes from './src/routes/systemRoutes.js';

import authRoutes from './src/routes/authRoutes.js';
import categoryRoutes from './src/routes/categoryRoutes.js';
import subcategoryRoutes from './src/routes/subcategoryRoutes.js';
import productRoutes from './src/routes/productRoutes.js';
import variantRoutes from './src/routes/variantRoutes.js';
import cartRoutes from './src/routes/cartRoutes.js';
import wishlistRoutes from './src/routes/wishlistRoutes.js';
import orderRoutes from './src/routes/orderRoutes.js';
import paymentRoutes from './src/routes/paymentRoutes.js';
import reviewRoutes from './src/routes/reviewRoutes.js';
import blogRoutes from './src/routes/blogRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';
import mediaRoutes from './src/routes/mediaRoutes.js';
import contactRoutes from './src/routes/contactRoutes.js';
import newsletterRoutes from './src/routes/newsletterRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const RAZORPAY_WEBHOOK_PATH = '/api/payments/razorpay/webhook';

const parseTrustProxy = (value) => {
  if (value === undefined || value === null || value === '') {
    return isProduction ? true : 1;
  }
  const text = String(value).trim().toLowerCase();
  if (text === 'true') return true;
  if (text === 'false') return false;
  const asNumber = Number(text);
  if (!Number.isNaN(asNumber)) return asNumber;
  return value;
};

// Must be set before any rate limiter so IP detection is correct behind proxies.
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

/* ---------------- BASIC HARDENING ---------------- */

app.disable('x-powered-by');

// Blocked IPs are rejected before anything else runs (parsers, limiters, routes).
app.use(ipBlockGuard);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(express.json({
  limit: '2mb',
  verify: (req, res, buf) => {
    if (String(req.originalUrl || '').startsWith(RAZORPAY_WEBHOOK_PATH)) {
      req.rawBody = Buffer.from(buf);
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

/* ---------------- CORS LOCKDOWN ---------------- */

const envOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const devOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const allowedOrigins =
  process.env.NODE_ENV === 'production'
    ? envOrigins
    : [...new Set([...envOrigins, ...devOrigins])];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('CORS blocked'));
    },
    credentials: true,
  })
);

/* ---------------- RATE LIMITING ---------------- */

const getRateLimitKey = (req) => {
  const userAgent = (req.get('user-agent') || 'unknown').slice(0, 120);
  return `${req.ip}|${userAgent}`;
};

const isSkippableRateLimitRequest = (req) => !isProduction || req.method === 'OPTIONS';

const globalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX || (isProduction ? 4000 : 10000)),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  skip: isSkippableRateLimitRequest,
  handler: (req, res) => {
    const retryAfterSeconds = Math.ceil((req.rateLimit?.resetTime?.getTime?.() || Date.now()) - Date.now()) / 1000;
    return res.status(429).json({
      message: 'Too many requests. Please try again shortly.',
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)),
    });
  },
  message: {
    message: 'Too many requests. Please try again shortly.',
  },
});

app.use('/api', globalLimiter);

// Track client IP activity for the admin online-users metric (O(1) per request).
app.use('/api', presenceTracker);

// Per-minute traffic buckets + status counts for the admin system monitor.
app.use('/api', trafficTracker);

const authSensitiveLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || (isProduction ? 40 : 200)),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  skip: isSkippableRateLimitRequest,
  skipSuccessfulRequests: true,
  message: {
    message: 'Too many auth attempts. Please try again later.',
  },
});

const authRefreshLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_REFRESH_RATE_LIMIT_WINDOW_MS || 1 * 60 * 1000),
  max: Number(process.env.AUTH_REFRESH_RATE_LIMIT_MAX || (isProduction ? 180 : 2000)),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  skip: isSkippableRateLimitRequest,
  message: {
    message: 'Too many refresh requests. Please retry shortly.',
  },
});

/* ---------------- STATIC UPLOADS (SAFE) ---------------- */

app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    dotfiles: 'deny',
    maxAge: '1d',
    setHeaders: res => {
      res.set('X-Content-Type-Options', 'nosniff');
    },
  })
);

/* ---------------- ROUTES ---------------- */

// Apply strict limits only to brute-force-prone endpoints.
app.use('/api/auth/login', authSensitiveLimiter);
app.use('/api/auth/register', authSensitiveLimiter);
app.use('/api/auth/forgot-password', authSensitiveLimiter);
app.use('/api/auth/reset-password', authSensitiveLimiter);
app.use('/api/auth/verify-email', authSensitiveLimiter);
app.use('/api/auth/resend-verification', authSensitiveLimiter);
// Keep refresh permissive to avoid accidental logouts during normal app polling/retries.
app.use('/api/auth/refresh', authRefreshLimiter);

app.use('/api/auth', authRoutes);

app.use('/api/categories', categoryRoutes);
app.use('/api/subcategories', subcategoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/variants', variantRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/admin/system', systemRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/newsletter', newsletterRoutes);

/* ---------------- HEALTH CHECK ---------------- */

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

/* ---------------- GLOBAL ERROR HANDLER ---------------- */

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

/* ---------------- START SERVER ---------------- */

const start = async () => {
  try {
    await connectDB();

    const blockedCount = await loadBlockedIpCache();
    if (blockedCount > 0) {
      console.log(`IP blocklist loaded: ${blockedCount} blocked IP(s)`);
    }

    const server = http.createServer(app);

    const io = new Server(server, {
      cors: {
        origin: allowedOrigins,
        credentials: true,
      },
    });

    initSocket(io);

    server.listen(PORT, () => {
      console.log(`🔥 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
};

start();
