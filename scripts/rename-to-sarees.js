import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';

import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import Subcategory from '../src/models/Subcategory.js';

dotenv.config();

/*
 * Rename the womens category to "Sarees" and set every product's title to its
 * subcategory name (keeping the original title in `originalTitle` for restore).
 *
 * SAFETY:
 *   - Dry run by default. Pass --apply to actually write.
 *   - On --apply, a JSON backup of every changed title is written first
 *     (scripts/backups/title-backup-<timestamp>.json), so it can be restored.
 *   - Idempotent: re-running never loses the first original title, and the
 *     category rename is skipped once done.
 *
 * Usage:
 *   node scripts/rename-to-sarees.js               # preview (no writes)
 *   node scripts/rename-to-sarees.js --apply       # perform the changes
 *   node scripts/rename-to-sarees.js --apply --no-category   # titles only
 *   node scripts/rename-to-sarees.js --apply --no-titles     # category only
 *   node scripts/rename-to-sarees.js --restore --apply       # UNDO everything
 */

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RESTORE = args.includes('--restore');
const DO_CATEGORY = !args.includes('--no-category');
const DO_TITLES = !args.includes('--no-titles');

// Undo: restore every product title from its originalTitle backup and rename the
// category back to womens.
const restore = async () => {
  console.log(APPLY ? '⚠  Mode: RESTORE + APPLY\n' : 'Mode: RESTORE DRY RUN (no writes)\n');

  const cat = await Category.findOne({ name: 'Sarees' });
  if (cat) {
    console.log(`CATEGORY: "Sarees" -> "womens"${APPLY ? '' : '  (dry-run)'}`);
    if (APPLY) await Category.updateOne({ _id: cat._id }, { $set: { name: 'womens' } });
  } else {
    console.log('CATEGORY: no "Sarees" category found — nothing to restore.');
  }

  const products = await Product.find({ originalTitle: { $exists: true, $ne: null } })
    .select('originalTitle')
    .lean();
  const ops = products.map((p) => ({
    updateOne: {
      filter: { _id: p._id },
      update: { $set: { title: p.originalTitle }, $unset: { originalTitle: '' } },
    },
  }));
  console.log(`TITLES: ${ops.length} to restore${APPLY ? '' : ' (dry-run)'}`);
  if (APPLY && ops.length) {
    const result = await Product.bulkWrite(ops);
    console.log(`  restored ${result.modifiedCount} product titles.`);
  }
};

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  if (RESTORE) {
    await restore();
    console.log(APPLY ? '\n✓ Restore done.' : '\n(DRY RUN — re-run with --apply to restore.)');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(APPLY ? '⚠  Mode: APPLY (writing changes)\n' : 'Mode: DRY RUN (no writes)\n');

  // ---- 1. Rename womens category -> Sarees (name only; slug stays "womens"
  //         so the /women and /sarees routes keep resolving). ----
  if (DO_CATEGORY) {
    const womens =
      (await Category.findOne({ slug: 'womens' })) ||
      (await Category.findOne({ status: 'Active', name: /^womens?$/i }));

    if (!womens) {
      console.log('CATEGORY: no "womens" category found — skipping rename.');
    } else if (womens.name === 'Sarees') {
      console.log('CATEGORY: already named "Sarees" — nothing to do.');
    } else {
      console.log(`CATEGORY: "${womens.name}" (slug=${womens.slug}) -> "Sarees"${APPLY ? '' : '  (dry-run)'}`);
      if (APPLY) {
        await Category.updateOne({ _id: womens._id }, { $set: { name: 'Sarees' } });
      }
    }
  }

  // ---- 2. Product title = subcategory name (backup original). ----
  if (DO_TITLES) {
    const subMap = new Map(
      (await Subcategory.find({}).select('name').lean()).map((s) => [String(s._id), s.name])
    );
    const products = await Product.find({}).select('title subcategoryId originalTitle').lean();

    const ops = [];
    const backup = [];
    let skippedNoSub = 0;
    let skippedNoName = 0;
    let unchanged = 0;
    const samples = [];

    for (const p of products) {
      if (!p.subcategoryId) {
        skippedNoSub += 1;
        continue;
      }
      const name = subMap.get(String(p.subcategoryId));
      if (!name) {
        skippedNoName += 1;
        continue;
      }
      if (p.title === name && p.originalTitle) {
        unchanged += 1;
        continue;
      }

      const set = { title: name };
      // Only capture the backup the first time we touch this product.
      if (!p.originalTitle) set.originalTitle = p.title;

      backup.push({ _id: String(p._id), originalTitle: p.originalTitle || p.title, newTitle: name });
      ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: set } } });
      if (samples.length < 8) samples.push(`  "${p.title}"  ->  "${name}"`);
    }

    console.log('\nPRODUCT TITLES:');
    console.log(`  to rename        : ${ops.length}`);
    console.log(`  already renamed  : ${unchanged}`);
    console.log(`  no subcategory   : ${skippedNoSub}`);
    console.log(`  subcat missing   : ${skippedNoName}`);
    if (samples.length) {
      console.log('  sample changes:');
      samples.forEach((s) => console.log(s));
    }

    if (APPLY && ops.length) {
      // Write the backup BEFORE mutating anything.
      const dir = path.join(process.cwd(), 'scripts', 'backups');
      await fs.mkdir(dir, { recursive: true });
      const backupPath = path.join(dir, `title-backup-${Date.now()}.json`);
      await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));
      console.log(`\n  backup written: ${backupPath}`);

      const result = await Product.bulkWrite(ops);
      console.log(`  updated ${result.modifiedCount} product titles.`);
    }
  }

  console.log(APPLY ? '\n✓ Done.' : '\n(DRY RUN — nothing was written. Re-run with --apply to commit.)');
  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (err) => {
  console.error('Failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
