import AuditLog from '../models/AuditLog.js';

export const audit = (action, entity) => async (req, res, next) => {
  res.on('finish', async () => {
    if (res.statusCode >= 400) return;
    try {
      await AuditLog.create({
        userId: req.user?._id,
        action,
        entity,
        entityId: req.params?.id,
        metadata: { path: req.originalUrl, method: req.method },
        ipAddress: req.ip,
      });
    } catch (_) {
      // ignore audit errors
    }
  });
  next();
};
