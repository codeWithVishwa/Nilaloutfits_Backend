import mongoose from 'mongoose';
import { attachDbMonitoring } from '../utils/dbStats.js';

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is not set');
  }

  try {
    // Building indexes on every boot is wasteful (and can block) in production.
    // Build them with `npm run sync:indexes` after deploy instead, and keep
    // autoIndex on only in dev for convenience.
    // monitorCommands enables driver command-timing events for the admin
    // system monitor (real per-query latency).
    await mongoose.connect(mongoUri, {
      autoIndex: process.env.NODE_ENV !== 'production',
      monitorCommands: true,
    });

    attachDbMonitoring(mongoose.connection.getClient());
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

export default connectDB;
