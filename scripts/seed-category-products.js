import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Category from '../src/models/Category.js';
import Product from '../src/models/Product.js';
import { slugify } from '../src/utils/slug.js';

dotenv.config();

const TARGET_PER_CATEGORY = Number(process.env.SEED_PRODUCTS_PER_CATEGORY || 100);
const IMAGE_URL =
  process.env.SEED_PRODUCT_IMAGE_URL ||
  'https://dummyimage.com/1200x1200/f3f4f6/111827&text=Nilal+Outfit';

const CATEGORY_MAP = [
  { key: 'womens', name: "Women's", slugCandidates: ['womens', 'women', 'woman'] },
  { key: 'mens', name: "Men's", slugCandidates: ['mens', 'men', 'man'] },
  { key: 'kids', name: 'Kids', slugCandidates: ['kids', 'kid'] },
];

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const findOrCreateCategory = async ({ key, name, slugCandidates }) => {
  let category = await Category.findOne({ slug: { $in: slugCandidates } });
  if (!category) {
    category = await Category.create({
      name,
      slug: key,
      status: 'Active',
      description: `${name} apparel and outfits`,
    });
    console.log(`Created category: ${category.name} (${category.slug})`);
  }
  return category;
};

const buildProductDoc = ({ category, serial }) => {
  const title = `${category.name} Outfit ${serial}`;
  const baseSlug = slugify(`${category.slug}-seed-${serial}`);

  return {
    title,
    slug: `${baseSlug}-${Date.now()}-${randomInt(1000, 9999)}`,
    description: `Seeded demo product ${serial} for ${category.name}.`,
    categoryId: category._id,
    brand: 'Nilal',
    price: randomInt(699, 2999),
    regularPrice: randomInt(899, 3499),
    sellingPrice: randomInt(699, 2999),
    stock: randomInt(5, 60),
    images: [IMAGE_URL],
    tags: [category.slug, 'seed', 'outfit'],
    status: 'Active',
    featuredBestSelling: false,
    featuredRecent: false,
  };
};

const run = async () => {
  try {
    if (!Number.isFinite(TARGET_PER_CATEGORY) || TARGET_PER_CATEGORY <= 0) {
      throw new Error('SEED_PRODUCTS_PER_CATEGORY must be a positive number');
    }

    await connectDB();

    for (const categoryInput of CATEGORY_MAP) {
      const category = await findOrCreateCategory(categoryInput);
      const existingCount = await Product.countDocuments({ categoryId: category._id });
      const needed = Math.max(0, TARGET_PER_CATEGORY - existingCount);

      if (needed === 0) {
        console.log(`${category.name}: already has ${existingCount} products, skipping.`);
        continue;
      }

      const docs = Array.from({ length: needed }, (_, index) =>
        buildProductDoc({ category, serial: existingCount + index + 1 })
      );

      await Product.insertMany(docs, { ordered: false });
      console.log(`${category.name}: added ${needed} products (now >= ${TARGET_PER_CATEGORY}).`);
    }

    await mongoose.disconnect();
    console.log('Category product seeding completed.');
  } catch (error) {
    console.error('Failed to seed category products:', error.message);
    process.exit(1);
  }
};

run();
