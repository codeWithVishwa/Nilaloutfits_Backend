/*
 * Full-stack HTTP load test — answers "how many users can the running site serve
 * end to end?" (Node + Express + MongoDB + network). Complements the DB-only test.
 *
 * It hammers the real public catalog endpoints at increasing concurrency and
 * reports requests/sec, latency (p50/p95/p99) and error rate per level.
 *
 * Usage:
 *   node scripts/loadtest-http.js
 *   node scripts/loadtest-http.js --url https://nilaloutfits.com/api
 *   node scripts/loadtest-http.js --levels 10,50,100,250,500 --duration 10 --p95 400
 *
 * Flags:
 *   --url URL        API base URL (default http://localhost:3000/api)
 *   --levels a,b,c   concurrent connections to ramp (default 10,25,50,100,200)
 *   --duration N     seconds per level (default 8)
 *   --p95 N          "seamless" p95 latency target in ms (default 400)
 *
 * NOTE: the API has rate limiting. In development (NODE_ENV != production) it is
 * skipped, so test a dev/staging instance for true capacity. Hitting production
 * will trip the limiter and report 429s (that's the limiter working, not a fault).
 */

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = String(flag('--url', 'http://localhost:3000/api')).replace(/\/+$/, '');
const LEVELS = String(flag('--levels', '10,25,50,100,200'))
  .split(',')
  .map((n) => parseInt(n, 10))
  .filter((n) => n > 0);
const DURATION_MS = Number(flag('--duration', 8)) * 1000;
const P95_TARGET = Number(flag('--p95', 400));

const percentile = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;

let productIds = [];
const randomProductPath = () => {
  const id = productIds[Math.floor(Math.random() * productIds.length)];
  return id ? `/products/${id}` : '/products?limit=12';
};

// Weighted endpoint mix mirroring real browsing.
const endpoints = [
  { weight: 40, path: () => '/products?limit=12&sort=recent' },
  { weight: 30, path: randomProductPath },
  { weight: 15, path: () => '/categories' },
  { weight: 15, path: () => '/subcategories' },
];
const pool = [];
endpoints.forEach((e, i) => {
  for (let n = 0; n < e.weight; n += 1) pool.push(i);
});
const pickPath = () => endpoints[pool[Math.floor(Math.random() * pool.length)]].path();

const runLevel = async (concurrency) => {
  const latencies = [];
  let ok = 0;
  let errors = 0;
  let rateLimited = 0;
  const deadline = Date.now() + DURATION_MS;

  const worker = async () => {
    while (Date.now() < deadline) {
      const start = process.hrtime.bigint();
      try {
        const res = await fetch(`${BASE}${pickPath()}`);
        // drain body so the connection is freed
        await res.arrayBuffer();
        if (res.status === 429) rateLimited += 1;
        else if (res.ok) ok += 1;
        else errors += 1;
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
  const total = ok + errors + rateLimited;
  return {
    concurrency,
    rps: Math.round(total / elapsedSec),
    avg: latencies.reduce((s, v) => s + v, 0) / (latencies.length || 1),
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    errors,
    rateLimited,
    total,
  };
};

const run = async () => {
  console.log(`Target: ${BASE}`);
  // Probe + collect real product ids for detail requests.
  try {
    const res = await fetch(`${BASE}/products?limit=50`);
    const body = await res.json();
    const data = Array.isArray(body) ? body : body?.data || [];
    productIds = data.map((p) => p._id).filter(Boolean);
    console.log(`Probe OK · sampled ${productIds.length} product ids`);
  } catch (err) {
    console.error(`Cannot reach ${BASE} — is the server running? (${err.message})`);
    process.exit(1);
  }
  console.log(`Levels: ${LEVELS.join(', ')} · ${DURATION_MS / 1000}s each · p95 target ${P95_TARGET}ms\n`);

  console.log('conn │  req/s │  avg ms │  p50 │  p95 │  p99 │ errors │ 429s');
  console.log('─────┼────────┼─────────┼──────┼──────┼──────┼────────┼──────');

  const results = [];
  for (const level of LEVELS) {
    await new Promise((r) => setTimeout(r, 500));
    const r = await runLevel(level);
    results.push(r);
    const f = (n) => String(Math.round(n)).padStart(4);
    console.log(
      `${String(level).padStart(4)} │ ${String(r.rps).padStart(6)} │ ${r.avg.toFixed(1).padStart(7)} │ ${f(r.p50)} │ ${f(r.p95)} │ ${f(r.p99)} │ ${String(r.errors).padStart(6)} │ ${String(r.rateLimited).padStart(4)}`
    );
  }

  const seamless = [...results].reverse().find((r) => r.p95 <= P95_TARGET && r.errors === 0);
  console.log('\n──────────────────────────── VERDICT ────────────────────────────');
  if (seamless) {
    console.log(`Seamless concurrency: ${seamless.concurrency} simultaneous connections`);
    console.log(`  sustained throughput: ${seamless.rps} req/sec  (p95 ${Math.round(seamless.p95)}ms)`);
    console.log('\nEstimated concurrent USERS (one request per think-time):');
    [3, 5, 10].forEach((think) => {
      console.log(`  · ${String(seamless.rps * think).padStart(7)} users  @ ${think}s think time`);
    });
  } else {
    console.log(`No level held under the ${P95_TARGET}ms p95 target.`);
    console.log('Inspect which layer saturates: compare with loadtest-mongo (DB) results.');
  }
  if (results.some((r) => r.rateLimited > 0)) {
    console.log('\n⚠ 429s seen — rate limiting is active (expected against production).');
  }
  process.exit(0);
};

run().catch((err) => {
  console.error('Load test failed:', err.message);
  process.exit(1);
});
