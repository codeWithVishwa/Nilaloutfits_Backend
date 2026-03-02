import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Subcategory from '../src/models/Subcategory.js';

dotenv.config();

const run = async () => {
  try {
    await connectDB();

    const collection = Subcategory.collection;
    const indexes = await collection.indexes();
    const legacySlugIndex = indexes.find((index) => index.name === 'slug_1');

    if (legacySlugIndex) {
      await collection.dropIndex('slug_1');
      console.log('Dropped legacy unique index: slug_1');
    } else {
      console.log('Legacy slug_1 index not found. Skipping drop.');
    }

    await Subcategory.syncIndexes();
    console.log('Subcategory indexes synced to schema.');

    await mongoose.disconnect();
  } catch (error) {
    console.error('Failed to migrate subcategory indexes:', error.message);
    process.exit(1);
  }
};

run();
