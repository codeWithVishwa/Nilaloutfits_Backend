import mongoose from 'mongoose';

// Persisted IP blocklist so blocks survive restarts. The hot-path check uses an
// in-memory cache (see middleware/ipBlock.js); this collection is the source of
// truth loaded at boot and updated by the admin endpoints.
const blockedIpSchema = new mongoose.Schema(
  {
    ip: { type: String, required: true, unique: true, trim: true },
    reason: { type: String, trim: true },
    blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const BlockedIp = mongoose.model('BlockedIp', blockedIpSchema);

export default BlockedIp;
