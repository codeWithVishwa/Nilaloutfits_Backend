// Fixed-size ring buffer of recent latency samples. record() is O(1); stats()
// sorts at most `sampleSize` numbers and is only called when an admin polls, so
// the hot path stays cheap. Used for both Mongo query time and API response time.
export const createLatencyTracker = ({ sampleSize = 500, slowMs = 200 } = {}) => {
  const buffer = new Array(sampleSize);
  let writeIndex = 0;
  let filled = 0;
  let totalCount = 0;
  let totalSum = 0;
  let slowCount = 0;

  return {
    record(ms) {
      const value = Number(ms);
      if (!Number.isFinite(value) || value < 0) return;
      buffer[writeIndex] = value;
      writeIndex = (writeIndex + 1) % sampleSize;
      if (filled < sampleSize) filled += 1;
      totalCount += 1;
      totalSum += value;
      if (value >= slowMs) slowCount += 1;
    },
    stats() {
      if (filled === 0) {
        return { count: 0, avgMs: null, p95Ms: null, maxMs: null, slowCount: 0 };
      }
      const sample = buffer.slice(0, filled).sort((a, b) => a - b);
      const p95Index = Math.min(filled - 1, Math.floor(filled * 0.95));
      const sampleAvg = sample.reduce((sum, v) => sum + v, 0) / filled;
      return {
        count: totalCount,
        avgMs: Number(sampleAvg.toFixed(1)),
        p95Ms: Number(sample[p95Index].toFixed(1)),
        maxMs: Number(sample[filled - 1].toFixed(1)),
        slowCount,
        // avg over the full lifetime, not just the window
        lifetimeAvgMs: Number((totalSum / totalCount).toFixed(1)),
      };
    },
  };
};
