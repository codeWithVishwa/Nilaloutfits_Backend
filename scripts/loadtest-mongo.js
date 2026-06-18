import dotenv from 'dotenv';
import mongoose from 'mongoose';

import Product from '../src/models/Product.js';
import Variant from '../src/models/Variant.js';
import Category from '../src/models/Category.js';
import Subcategory from '../src/models/Subcategory.js';

dotenv.config();

/*
 * MongoDB capacity load test — answers "how many users can the database serve?"
 *
 * It runs the SAME read queries the app's hot paths use (catalog list, product
 * detail, category/subcategory lists, active count) directly against MongoDB, at
 * increasing concurrency, and reports throughput (ops/sec) and latency
 * (p50/p95/p99). Point MONGO_URI (or --uri) at Atlas to measure an Atlas tier;
 * run it against your current DB first to get a baseline to compare.
 *
 * Usage:
 *   node scripts/loadtest-mongo.js
 *   node scripts/loadtest-mongo.js --uri "mongodb+srv://user:pass@cluster/db" --pool 200
 *   node scripts/loadtest-mongo.js --levels 1,10,50,100,250,500 --duration 10 --p95 200
 *
 * Flags:
 *   --uri URI        MongoDB connection string (defaults to MONGO_URI from .env)
 *   --levels a,b,c   concurrency levels to ramp through (default 1,5,10,25,50,100,200)
 *   --duration N     seconds per level (default 8)
 *   --pool N         driver maxPoolSize (default = highest level, so it isn't the bottleneck)
 *   --p95 N          "seamless" p95 latency target in ms (default 200)
 */

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const URI = flag('--uri', process.env.MONGO_URI);
const LEVELS = String(flag('--levels', '1,5,10,25,50,100,200'))
  .split(',')
  .map((n) => parseInt(n, 10))
  .filter((n) => n > 0);
const DURATION_MS = Number(flag('--duration', 8)) * 1000;
const P95_TARGET = Number(flag('--p95', 200));
const MAX_LEVEL = Math.max(...LEVELS);
const POOL = Number(flag('--pool', MAX_LEVEL));

if (!URI) {
  console.error('No connection string. Set MONGO_URI in .env or pass --uri.');
  process.exit(1);
}

const percentile = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;

// --- Representative query mix (weights approximate real browsing traffic) ---
let sampleIds = [];
const randomId = () => sampleIds[Math.floor(Math.random() * sampleIds.length)] || new mongoose.Types.ObjectId();

const operations = [
  {
    name: 'catalogList',
    weight: 40,
    run: () => Product.find({ status: 'Active' }).sort({ createdAt: -1 }).limit(12).lean(),
  },
  {
    name: 'productDetail',
    weight: 30,
    run: () => {
      const id = randomId();
      return Promise.all([Product.findById(id).lean(), Variant.find({ productId: id }).lean()]);
    },
  },
  {
    name: 'categoryList',
    weight: 10,
    run: () => Category.find({ status: 'Active' }).sort({ createdAt: -1 }).limit(100).lean(),
  },
  {
    name: 'subcategoryList',
    weight: 10,
    run: () => Subcategory.find({}).sort({ createdAt: -1 }).limit(100).lean(),
  },
  {
    name: 'countActive',
    weight: 10,
    run: () => Product.countDocuments({ status: 'Active' }),
  },
];

// Weighted picker.
const weightedPool = [];
operations.forEach((op, idx) => {
  for (let i = 0; i < op.weight; i += 1) weightedPool.push(idx);
});
const pickOp = () => operations[weightedPool[Math.floor(Math.random() * weightedPool.length)]];

const runLevel = async (concurrency) => {
  const latencies = [];
  let ok = 0;
  let errors = 0;
  const deadline = Date.now() + DURATION_MS;

  const worker = async () => {
    while (Date.now() < deadline) {
      const op = pickOp();
      const start = process.hrtime.bigint();
      try {
        await op.run();
        ok += 1;
      } catch {
        errors += 1;
      }
      latencies.push(Number(process.hrtime.bigint() - start) / 1e6);
    }
  };

  const startedAt = Date.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsedSec = (Date.now() - startedAt) / 1000;

  latencies.sort((a, b) => a - b);
  const total = ok + errors;
  return {
    concurrency,
    opsPerSec: Math.round(total / elapsedSec),
    avg: latencies.reduce((s, v) => s + v, 0) / (latencies.length || 1),
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    max: latencies[latencies.length - 1] || 0,
    errors,
    total,
  };
};

const run = async () => {
  console.log('Connecting…');
  await mongoose.connect(URI, { maxPoolSize: POOL, serverSelectionTimeoutMS: 10000 });
  const host = mongoose.connection.host;
  console.log(`Connected to ${host} (pool ${POOL})`);

  // Warm sample of real product ids so productDetail hits real documents.
  sampleIds = (await Product.find({}).select('_id').limit(300).lean()).map((p) => p._id);
  console.log(`Sampled ${sampleIds.length} product ids.`);
  console.log(`Levels: ${LEVELS.join(', ')} · ${DURATION_MS / 1000}s each · p95 target ${P95_TARGET}ms\n`);

  console.log('conc │   ops/s │  avg ms │  p50 │  p95 │  p99 │   max │ errors');
  console.log('─────┼─────────┼─────────┼──────┼──────┼──────┼───────┼───────');

  const results = [];
  for (const level of LEVELS) {
    // brief cooldown so levels don't bleed into each other
    await new Promise((r) => setTimeout(r, 500));
    const r = await runLevel(level);
    results.push(r);
    const f = (n) => String(Math.round(n)).padStart(4);
    console.log(
      `${String(level).padStart(4)} │ ${String(r.opsPerSec).padStart(7)} │ ${r.avg.toFixed(1).padStart(7)} │ ${f(r.p50)} │ ${f(r.p95)} │ ${f(r.p99)} │ ${String(Math.round(r.max)).padStart(5)} │ ${String(r.errors).padStart(5)}`
    );
  }

  // Verdict: highest level meeting p95 target with zero errors.
  const seamless = [...results].reverse().find((r) => r.p95 <= P95_TARGET && r.errors === 0);
  console.log('\n──────────────────────────── VERDICT ────────────────────────────');
  if (seamless) {
    console.log(`Seamless DB concurrency: ${seamless.concurrency} in-flight query streams`);
    console.log(`  sustained throughput : ${seamless.opsPerSec} ops/sec  (p95 ${Math.round(seamless.p95)}ms, 0 errors)`);
    console.log('\nEstimated concurrent USERS (one action per think-time):');
    [3, 5, 10].forEach((think) => {
      console.log(`  · ${String(seamless.opsPerSec * think).padStart(7)} users  @ ${think}s think time`);
    });
    console.log('\n(Each browsing action ≈ 1–2 of these queries. With HTTP/CDN caching');
    console.log(' in front, real user capacity is typically higher than this DB-only figure.)');
  } else {
    console.log(`No level stayed under the ${P95_TARGET}ms p95 target. The DB is the bottleneck`);
    console.log('even at the lowest concurrency — raise --p95, check indexes, or size up the tier.');
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (err) => {
  console.error('Load test failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
