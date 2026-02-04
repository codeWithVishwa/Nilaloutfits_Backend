import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import User from '../src/models/User.js';
import { ROLE_PERMISSIONS } from '../src/config/roles.js';

dotenv.config();

const EMAIL = process.env.SEED_EMAIL || 'nilaloutfits@gmail.com';
const PASSWORD = process.env.SEED_PASSWORD || 'nilaloutfits@glm123';
const NAME = process.env.SEED_NAME || 'Verified User';
const ROLE = process.env.SEED_ROLE || 'customer';

const run = async () => {
  try {
    await connectDB();

    const existing = await User.findOne({ email: EMAIL.toLowerCase() });
    if (existing) {
      existing.name = NAME;
      existing.password = PASSWORD;
      existing.role = ROLE;
      existing.permissions = ROLE_PERMISSIONS[ROLE] || [];
      existing.isEmailVerified = true;
      existing.emailVerifyToken = undefined;
      existing.emailVerifyExpires = undefined;
      await existing.save();
      console.log('Updated verified user:', existing.email);
      await mongoose.disconnect();
      return;
    }

    const user = await User.create({
      name: NAME,
      email: EMAIL.toLowerCase(),
      password: PASSWORD,
      role: ROLE,
      permissions: ROLE_PERMISSIONS[ROLE] || [],
      isEmailVerified: true,
      emailVerifyToken: undefined,
      emailVerifyExpires: undefined,
    });

    console.log('Created verified user:', user.email);
    await mongoose.disconnect();
  } catch (error) {
    console.error('Failed to create verified user:', error.message);
    process.exit(1);
  }
};

run();
