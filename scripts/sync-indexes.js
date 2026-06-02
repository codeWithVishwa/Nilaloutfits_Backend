import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';

// Import models so their schemas (and index definitions) are registered.
import Product from '../src/models/Product.js';
import Variant from '../src/models/Variant.js';
import Order from '../src/models/Order.js';
import Category from '../src/models/Category.js';
import Subcategory from '../src/models/Subcategory.js';

dotenv.config();

// With autoIndex disabled in production, indexes must be built explicitly after
// a deploy. syncIndexes() creates any missing indexes and drops ones no longer
// defined on the schema, so it is safe to re-run.
const models = [
  ['Product', Product],
  ['Variant', Variant],
  ['Order', Order],
  ['Category', Category],
  ['Subcategory', Subcategory],
];

const run = async () => {
  try {
    await connectDB();

    for (const [name, model] of models) {
      await model.syncIndexes();
      console.log(`✓ ${name} indexes synced`);
    }

    console.log('All indexes synced to schema.');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Failed to sync indexes:', error.message);
    process.exit(1);
  }
};

run();
