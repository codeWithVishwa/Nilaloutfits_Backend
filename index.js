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

/* ---------------- BASIC HARDENING ---------------- */

app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(express.json({ limit: '2mb' }));
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

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 2500,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);
app.set("trust proxy", 1);

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 2500,
  max: 10,
  message: 'Too many attempts. Try later.',
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

app.use('/api/auth', authLimiter, authRoutes);

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
