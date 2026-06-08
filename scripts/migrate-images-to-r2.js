import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs/promises';

import connectDB from '../src/config/db.js';
import Product from '../src/models/Product.js';
import { isR2Configured, getR2PublicBaseUrl } from '../src/config/r2.js';
import { optimizeImageBuffer } from '../src/utils/imageOptimize.js';
import { uploadBufferToR2, buildProductImageKey } from '../src/utils/r2Upload.js';

dotenv.config();

/*
 * Migrate existing product imagery to Cloudflare R2.
 *
 * For every image URL on a product (top-level images[] and colorVariants[].images[])
 * this script:
 *   1. loads the source bytes (from the local uploads/ dir, or by fetching the URL),
 *   2. optimizes them (resize + WebP),
 *   3. uploads the result to R2,
 *   4. rewrites the stored URL to the new R2 URL.
 *
 * It is idempotent: URLs already pointing at R2_PUBLIC_BASE_URL are skipped, and
 * identical source URLs are uploaded only once (deduped within a run).
 *
 * Flags:
 *   --dry-run     report what would happen, upload nothing, write nothing
 *   --limit N     only process the first N products (handy for a test run)
 *   --uploads DIR override the local uploads directory (default: <cwd>/uploads)
 */

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const getFlagValue = (name) => {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
};

const DRY_RUN = hasFlag('--dry-run');
const LIMIT = Number(getFlagValue('--limit')) || 0;
const UPLOADS_DIR = getFlagValue('--uploads') || path.join(process.cwd(), 'uploads');

const stats = { products: 0, changedProducts: 0, migrated: 0, skipped: 0, failed: 0 };

const isAlreadyOnR2 = (url) => {
  const base = getR2PublicBaseUrl();
  return Boolean(base) && url.startsWith(base);
};

// Resolve the raw bytes for a stored image URL. Prefers the local uploads file
// (fast, no network), falling back to fetching the URL for anything remote.
const loadSourceBuffer = async (url) => {
  const uploadsMatch = url.match(/\/uploads\/([^/?#]+)$/i);
  if (uploadsMatch) {
    const filePath = path.join(UPLOADS_DIR, decodeURIComponent(uploadsMatch[1]));
    try {
      return await fs.readFile(filePath);
    } catch {
      // Fall through to fetching if the local file is missing.
    }
  }

  if (/^https?:\/\//i.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  throw new Error('source not found (no local file and not an http url)');
};

// Returns the new R2 URL for a source URL, using/maintaining a per-run dedupe map.
const migrateOneImage = async (url, urlCache) => {
  if (!url || typeof url !== 'string') return url;
  if (isAlreadyOnR2(url)) {
    stats.skipped += 1;
    return url;
  }
  if (urlCache.has(url)) {
    stats.skipped += 1;
    return urlCache.get(url);
  }

  const buffer = await loadSourceBuffer(url);
  const optimized = await optimizeImageBuffer(buffer);
  const key = buildProductImageKey();

  let newUrl = url;
  if (DRY_RUN) {
    newUrl = `${getR2PublicBaseUrl() || '<R2>'}/${key} (dry-run)`;
  } else {
    newUrl = await uploadBufferToR2(optimized, key);
  }

  urlCache.set(url, newUrl);
  stats.migrated += 1;
  const savedPct = buffer.length ? Math.round((1 - optimized.length / buffer.length) * 100) : 0;
  console.log(`  ✓ ${url}\n    -> ${newUrl}  (${buffer.length} -> ${optimized.length} bytes, -${savedPct}%)`);
  return newUrl;
};

const migrateImageArray = async (images, urlCache) => {
  if (!Array.isArray(images)) return { images, changed: false };
  let changed = false;
  const next = [];
  for (const img of images) {
    try {
      const migrated = await migrateOneImage(img, urlCache);
      if (migrated !== img) changed = true;
      next.push(migrated);
    } catch (error) {
      stats.failed += 1;
      console.warn(`  ✗ ${img}\n    failed: ${error.message} (keeping original)`);
      next.push(img);
    }
  }
  return { images: next, changed };
};

const run = async () => {
  // A real run needs full R2 config; a dry run can preview locally without it.
  if (!DRY_RUN && !isR2Configured()) {
    console.error(
      'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_BASE_URL before running.'
    );
    process.exit(1);
  }

  // Fail fast on bad credentials/permissions before scanning the whole catalog.
  if (!DRY_RUN) {
    try {
      await uploadBufferToR2(Buffer.from('ok'), 'preflight/__r2_write_check__.txt', {
        contentType: 'text/plain',
      });
      console.log('R2 write check: OK');
    } catch (error) {
      console.error(`\nR2 write check FAILED: ${error.message}`);
      console.error(
        'The API token likely lacks "Object Read & Write" on this bucket, or the\n' +
        'bucket/account is mismatched. Fix it in Cloudflare -> R2 -> Manage R2 API\n' +
        'Tokens (create a token with Object Read & Write for the target bucket),\n' +
        'update R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY in .env, then re-run.'
      );
      await mongoose.disconnect().catch(() => {});
      process.exit(1);
    }
  }

  await connectDB();
  console.log(`Uploads dir: ${UPLOADS_DIR}`);
  console.log(DRY_RUN ? 'Mode: DRY RUN (no uploads, no DB writes)\n' : 'Mode: LIVE\n');

  const query = Product.find({}).cursor();
  // Dedupe identical source URLs across the whole run so a shared image uploads once.
  const urlCache = new Map();

  for await (const product of query) {
    if (LIMIT && stats.products >= LIMIT) break;
    stats.products += 1;
    console.log(`[${stats.products}] ${product.title || product._id}`);

    let productChanged = false;

    const topResult = await migrateImageArray(product.images, urlCache);
    if (topResult.changed) {
      product.images = topResult.images;
      productChanged = true;
    }

    if (Array.isArray(product.colorVariants)) {
      for (const variant of product.colorVariants) {
        const variantResult = await migrateImageArray(variant.images, urlCache);
        if (variantResult.changed) {
          variant.images = variantResult.images;
          productChanged = true;
        }
      }
    }

    if (productChanged && !DRY_RUN) {
      await product.save();
      stats.changedProducts += 1;
    } else if (productChanged) {
      stats.changedProducts += 1;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Products scanned:   ${stats.products}`);
  console.log(`Products updated:   ${stats.changedProducts}`);
  console.log(`Images migrated:    ${stats.migrated}`);
  console.log(`Images skipped:     ${stats.skipped}`);
  console.log(`Images failed:      ${stats.failed}`);
  if (DRY_RUN) console.log('\n(DRY RUN — nothing was uploaded or saved.)');

  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (error) => {
  console.error('Migration failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
