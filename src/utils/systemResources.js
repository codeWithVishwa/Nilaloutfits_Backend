import os from 'os';
import { statfs } from 'fs/promises';

// ---- CPU usage % (sampled) ----
// os.cpus() gives cumulative tick counts; CPU% is the change in non-idle ticks
// between two samples. We refresh on a background interval so reads are instant.
const snapshotCpu = () => {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const value of Object.values(cpu.times)) total += value;
    idle += cpu.times.idle;
  }
  return { idle, total };
};

let prevCpu = snapshotCpu();
let cpuPercent = 0;
setInterval(() => {
  const cur = snapshotCpu();
  const idleDiff = cur.idle - prevCpu.idle;
  const totalDiff = cur.total - prevCpu.total;
  cpuPercent = totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0;
  prevCpu = cur;
}, 3000).unref();

const toGb = (bytes) => Number((bytes / 1024 / 1024 / 1024).toFixed(2));
const pct = (used, total) => (total > 0 ? Math.round((used / total) * 100) : 0);

export const getCpuStats = () => ({
  usagePercent: cpuPercent,
  cores: os.cpus().length,
  // Load average is meaningful per-core on Linux; null on platforms without it.
  loadAvg: os.loadavg().map((n) => Number(n.toFixed(2))),
});

export const getMemoryStats = () => {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    totalGb: toGb(total),
    usedGb: toGb(used),
    freeGb: toGb(free),
    usagePercent: pct(used, total),
  };
};

export const getDiskStats = async (path = process.env.DISK_MONITOR_PATH || '/') => {
  try {
    const s = await statfs(path);
    const total = s.blocks * s.bsize;
    const free = s.bfree * s.bsize; // free to root
    const avail = s.bavail * s.bsize; // available to unprivileged users
    const used = total - free;
    return {
      path,
      totalGb: toGb(total),
      usedGb: toGb(used),
      availableGb: toGb(avail),
      usagePercent: pct(used, total),
    };
  } catch {
    return null; // statfs unsupported / path missing — degrade gracefully
  }
};
