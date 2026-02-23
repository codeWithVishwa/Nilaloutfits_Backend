import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import Subcategory from '../src/models/Subcategory.js';

dotenv.config();

const uri = process.env.MONGO_URI;

const args = process.argv.slice(2);
const getArg = (name) => {
  const token = args.find((entry) => entry.startsWith(`--${name}=`));
  return token ? token.slice(name.length + 3) : '';
};

const fromId = getArg('from');
const toId = getArg('to');
const mode = getArg('mode') || (fromId && toId ? 'relink' : 'list');

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const listOrphanCategoryUsage = async () => {
  const categories = await Category.find({}, { _id: 1, name: 1, slug: 1, status: 1 }).lean();
  const categoryIdSet = new Set(categories.map((c) => String(c._id)));

  const grouped = await Product.aggregate([
    { $group: { _id: '$categoryId', count: { $sum: 1 } } },
  ]);

  const orphanGroups = grouped
    .map((item) => ({ categoryId: String(item._id), count: item.count }))
    .filter((item) => !categoryIdSet.has(item.categoryId));

  if (orphanGroups.length === 0) {
    console.log('No orphan category references found in products.');
    return;
  }

  console.log('Orphan category references found:\n');
  for (const group of orphanGroups) {
    const sampleProducts = await Product.find(
      { categoryId: group.categoryId },
      { title: 1, subcategoryId: 1 }
    )
      .limit(5)
      .lean();

    console.log(`- categoryId: ${group.categoryId}`);
    console.log(`  products: ${group.count}`);
    console.log(
      `  sample titles: ${sampleProducts.map((p) => p.title).join(' | ') || '(none)'}`
    );
  }

  console.log('\nRun relink command:');
  console.log(
    'node scripts/relink-orphan-category-products.js --mode=relink --from=<oldCategoryId> --to=<newCategoryId>'
  );
};

const relinkCategoryUsage = async () => {
  if (!isValidObjectId(fromId) || !isValidObjectId(toId)) {
    throw new Error('Both --from and --to must be valid ObjectIds.');
  }

  if (String(fromId) === String(toId)) {
    throw new Error('--from and --to cannot be the same.');
  }

  const targetCategory = await Category.findById(toId).lean();
  if (!targetCategory) {
    throw new Error(`Target category not found: ${toId}`);
  }

  const productResult = await Product.updateMany(
    { categoryId: fromId },
    { $set: { categoryId: toId } }
  );

  const subcategoryResult = await Subcategory.updateMany(
    { parentCategoryId: fromId },
    { $set: { parentCategoryId: toId } }
  );

  console.log('Relink completed successfully.');
  console.log(`Products updated: ${productResult.modifiedCount}`);
  console.log(`Subcategories updated: ${subcategoryResult.modifiedCount}`);
  console.log(`Old category ID: ${fromId}`);
  console.log(`New category ID: ${toId} (${targetCategory.name})`);
};

const main = async () => {
  if (!uri) {
    throw new Error('MONGO_URI is missing in environment.');
  }

  await mongoose.connect(uri);
  try {
    if (mode === 'relink') {
      await relinkCategoryUsage();
    } else {
      await listOrphanCategoryUsage();
    }
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

