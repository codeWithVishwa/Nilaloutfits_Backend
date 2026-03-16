import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Category from '../src/models/Category.js';
import Subcategory from '../src/models/Subcategory.js';
import Product from '../src/models/Product.js';
import Variant from '../src/models/Variant.js';
import { slugify } from '../src/utils/slug.js';

dotenv.config();

const TARGET_PRODUCTS = Number(process.env.SEED_BULK_PRODUCT_COUNT || 1000);
const MARKER = String(process.env.SEED_BULK_MARKER || 'seed-bulk-1000').trim().toLowerCase();
const RESET_EXISTING = String(process.env.SEED_BULK_RESET_EXISTING || 'true').toLowerCase() !== 'false';
const BATCH_ID = Date.now().toString(36);

const ADULT_SIZES = ['S', 'M', 'L', 'XL'];
const KIDS_SIZES = ['1-2', '3-4', '5-6'];
const COLOR_PALETTE = [
  { name: 'Rose', bg: 'c2416c', text: 'ffffff' },
  { name: 'Sand', bg: 'b08968', text: 'ffffff' },
  { name: 'Forest', bg: '3f6b56', text: 'ffffff' },
  { name: 'Ink', bg: '334155', text: 'ffffff' },
  { name: 'Marigold', bg: 'd97706', text: 'ffffff' },
  { name: 'Berry', bg: '7c3aed', text: 'ffffff' },
];

const BRAND_POOL = ['Nilal', 'Thread Theory', 'Coastline', 'Urban Loom', 'Mango Leaf', 'South Studio'];

const CATEGORY_SPECS = [
  {
    slug: 'women',
    name: 'Women',
    audience: 'women',
    subcategories: ['Dresses', 'Tops', 'Kurtas', 'Sarees', 'Co-Ords', 'Jeans'],
    titleWords: ['Classic', 'Flow', 'Grace', 'Bloom', 'Heritage', 'Aura'],
    sizes: ADULT_SIZES,
  },
  {
    slug: 'men',
    name: 'Men',
    audience: 'men',
    subcategories: ['Shirts', 'T-Shirts', 'Kurtas', 'Trousers', 'Jeans'],
    titleWords: ['Prime', 'Field', 'Edge', 'Craft', 'Metro', 'Summit'],
    sizes: ADULT_SIZES,
  },
  {
    slug: 'kids',
    name: 'Kids',
    audience: 'kids',
    subcategories: ['Frocks', 'Sets', 'T-Shirts', 'Pants', 'Ethnic Wear'],
    titleWords: ['Bright', 'Play', 'Sunny', 'Tiny', 'Happy', 'Spark'],
    sizes: KIDS_SIZES,
  },
];

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomChoice = (items) => items[randomInt(0, items.length - 1)];
const encodeDummyText = (value) => encodeURIComponent(value).replace(/%20/g, '+');

const buildImageUrl = ({ title, bg, text }) =>
  `https://dummyimage.com/1200x1500/${bg}/${text}&text=${encodeDummyText(title)}`;

const buildDescription = ({ title, categoryName, subcategoryName, colorName }) =>
  `${title} is a seeded preview product for ${categoryName} ${subcategoryName}. Designed in ${colorName.toLowerCase()} tones with ready-to-shop sizing for catalog testing.`;

const ensureCategory = async (spec) => {
  const existing = await Category.findOne({ slug: spec.slug });
  if (existing) return existing;

  return Category.create({
    name: spec.name,
    slug: spec.slug,
    description: `${spec.name} apparel`,
    status: 'Active',
  });
};

const ensureSubcategory = async ({ category, name }) => {
  const slug = slugify(name);
  const existing = await Subcategory.findOne({
    parentCategoryId: category._id,
    parentSubcategoryId: null,
    slug,
  });
  if (existing) return existing;

  return Subcategory.create({
    name,
    slug,
    parentCategoryId: category._id,
    parentSubcategoryId: null,
    status: 'Active',
  });
};

const cleanupExistingSeed = async () => {
  const seededProducts = await Product.find({ tags: MARKER }).select('_id').lean();
  if (seededProducts.length === 0) return;

  const productIds = seededProducts.map((product) => product._id);
  await Variant.deleteMany({ productId: { $in: productIds } });
  await Product.deleteMany({ _id: { $in: productIds } });
};

const buildProductAndVariants = ({ category, subcategory, titleWords, sizes, serial }) => {
  const productId = new mongoose.Types.ObjectId();
  const accent = randomChoice(COLOR_PALETTE);
  const brand = randomChoice(BRAND_POOL);
  const title = `${randomChoice(titleWords)} ${subcategory.name} ${String(serial).padStart(3, '0')}`;
  const sellingPrice = randomInt(549, 2899);
  const regularPrice = sellingPrice + randomInt(150, 800);
  const variantDocs = sizes.map((size, index) => {
    const stock = randomInt(4, 18);
    const variantId = new mongoose.Types.ObjectId();

    return {
      _id: variantId,
      productId,
      size,
      color: accent.name,
      sku: `SD${BATCH_ID}${String(serial).padStart(4, '0')}${String(index + 1).padStart(2, '0')}`.toUpperCase(),
      price: sellingPrice,
      stock,
      availability: stock > 0 ? 'InStock' : 'OutOfStock',
    };
  });

  const stock = variantDocs.reduce((sum, variant) => sum + variant.stock, 0);
  const imageTitle = `${category.name} ${subcategory.name} ${serial}`;

  const productDoc = {
    _id: productId,
    title,
    slug: `${slugify(`${category.slug}-${subcategory.slug}-${title}`)}-${BATCH_ID}`,
    description: buildDescription({
      title,
      categoryName: category.name,
      subcategoryName: subcategory.name,
      colorName: accent.name,
    }),
    categoryId: category._id,
    subcategoryId: subcategory._id,
    brand,
    price: sellingPrice,
    regularPrice,
    sellingPrice,
    shippingCost: 0,
    stock,
    images: [
      buildImageUrl({ title: imageTitle, bg: accent.bg, text: accent.text }),
      buildImageUrl({ title: `${imageTitle} Look 2`, bg: 'e5e7eb', text: '111827' }),
    ],
    colorVariants: [
      {
        name: accent.name,
        images: [buildImageUrl({ title: imageTitle, bg: accent.bg, text: accent.text })],
      },
    ],
    tags: [category.slug, subcategory.slug, 'seed', MARKER],
    status: 'Active',
    featuredBestSelling: serial <= 12,
    featuredRecent: serial <= 18,
    featuredVariantIds: variantDocs.slice(0, 1).map((variant) => variant._id),
  };

  return { productDoc, variantDocs };
};

const run = async () => {
  try {
    if (!Number.isFinite(TARGET_PRODUCTS) || TARGET_PRODUCTS <= 0) {
      throw new Error('SEED_BULK_PRODUCT_COUNT must be a positive number');
    }

    if (!MARKER) {
      throw new Error('SEED_BULK_MARKER must not be empty');
    }

    await connectDB();

    const categorySpecsWithRefs = [];
    for (const spec of CATEGORY_SPECS) {
      const category = await ensureCategory(spec);
      const subcategories = [];

      for (const subcategoryName of spec.subcategories) {
        const subcategory = await ensureSubcategory({ category, name: subcategoryName });
        subcategories.push(subcategory);
      }

      categorySpecsWithRefs.push({
        ...spec,
        category,
        subcategories,
      });
    }

    if (RESET_EXISTING) {
      await cleanupExistingSeed();
    }

    const placementPool = categorySpecsWithRefs.flatMap((spec) =>
      spec.subcategories.map((subcategory) => ({
        category: spec.category,
        subcategory,
        titleWords: spec.titleWords,
        sizes: spec.sizes,
      }))
    );

    const productDocs = [];
    const variantDocs = [];

    for (let index = 0; index < TARGET_PRODUCTS; index += 1) {
      const placement = placementPool[index % placementPool.length];
      const { productDoc, variantDocs: nextVariants } = buildProductAndVariants({
        ...placement,
        serial: index + 1,
      });
      productDocs.push(productDoc);
      variantDocs.push(...nextVariants);
    }

    await Product.insertMany(productDocs, { ordered: false });
    await Variant.insertMany(variantDocs, { ordered: false });

    console.log(`Seeded ${productDocs.length} products with ${variantDocs.length} variants.`);
    console.log(`Marker tag: ${MARKER}`);
    console.log(`Categories used: ${categorySpecsWithRefs.map((item) => item.category.slug).join(', ')}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Failed to seed bulk products:', error.message);
    process.exit(1);
  }
};

run();
