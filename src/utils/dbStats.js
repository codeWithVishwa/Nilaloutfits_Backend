import { createLatencyTracker } from './latency.js';

// Real MongoDB query timing, captured from the driver's command-monitoring
// events (durationMS). We only track actual data operations and ignore
// housekeeping commands so the numbers reflect application queries.
const tracker = createLatencyTracker({ sampleSize: 500, slowMs: 100 });

const TRACKED_COMMANDS = new Set([
  'find',
  'aggregate',
  'count',
  'distinct',
  'insert',
  'update',
  'delete',
  'findAndModify',
  'getMore',
]);

// Attach to the underlying MongoClient (requires monitorCommands: true on the
// connection). Safe to call once after connect.
export const attachDbMonitoring = (client) => {
  if (!client || typeof client.on !== 'function') return;

  client.on('commandSucceeded', (event) => {
    if (TRACKED_COMMANDS.has(event.commandName)) {
      tracker.record(event.duration);
    }
  });
  client.on('commandFailed', (event) => {
    if (TRACKED_COMMANDS.has(event.commandName)) {
      tracker.record(event.duration);
    }
  });
};

export const getDbQueryStats = () => tracker.stats();
