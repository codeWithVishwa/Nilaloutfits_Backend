import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Category from '../src/models/Category.js';
import Subcategory from '../src/models/Subcategory.js';
import { slugify } from '../src/utils/slug.js';

dotenv.config();

const MAIN_SUBCATEGORIES = [
  {
    name: 'Boys',
    slug: 'kids-boys',
    children: ['T-Shirts', 'Shirts', 'Pants', 'Shorts', 'Ethnic Wear', 'Sets'],
  },
  {
    name: 'Girls',
    slug: 'kids-girls',
    children: ['Frocks', 'Tops', 'Leggings', 'Skirts', 'Ethnic Wear', 'Sets'],
  },
];

const upsertSubcategory = async ({
  name,
  slug,
  parentCategoryId,
  parentSubcategoryId = null,
}) => {
  const existing = await Subcategory.findOne({
    parentCategoryId,
    parentSubcategoryId,
    slug,
  });

  if (existing) {
    if (existing.name !== name || existing.status !== 'Active') {
      existing.name = name;
      existing.status = 'Active';
      await existing.save();
      console.log(`Updated subcategory: ${name} (${slug})`);
    } else {
      console.log(`Subcategory already exists: ${name}`);
    }
    return existing;
  }

  const created = await Subcategory.create({
    name,
    slug,
    parentCategoryId,
    parentSubcategoryId,
    status: 'Active',
  });
  console.log(`Created subcategory: ${name} (${slug})`);
  return created;
};

const run = async () => {
  try {
    await connectDB();

    const kidsCategory = await Category.findOne({
      slug: { $in: ['kids', 'kid'] },
      status: 'Active',
    });

    if (!kidsCategory) {
      throw new Error("Active 'Kids' category not found");
    }

    for (const target of MAIN_SUBCATEGORIES) {
      const mainSubcategory = await upsertSubcategory({
        name: target.name,
        slug: target.slug,
        parentCategoryId: kidsCategory._id,
        parentSubcategoryId: null,
      });

      for (const childName of target.children) {
        const childSlug = `${target.slug}-${slugify(childName)}`;
        await upsertSubcategory({
          name: childName,
          slug: childSlug,
          parentCategoryId: kidsCategory._id,
          parentSubcategoryId: mainSubcategory._id,
        });
      }
    }

    console.log('Kids subcategory seeding completed.');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Failed to seed kids subcategories:', error.message);
    process.exit(1);
  }
};

run();
