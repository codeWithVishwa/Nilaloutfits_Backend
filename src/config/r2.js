import { S3Client } from '@aws-sdk/client-s3';

// Cloudflare R2 is S3-compatible, so we talk to it with the AWS S3 SDK pointed
// at the R2 endpoint. Required env vars:
//   R2_ACCOUNT_ID         - Cloudflare account id (from the R2 dashboard)
//   R2_ACCESS_KEY_ID      - R2 API token access key
//   R2_SECRET_ACCESS_KEY  - R2 API token secret
//   R2_BUCKET             - target bucket name
//   R2_PUBLIC_BASE_URL    - public base URL for objects, e.g.
//                           https://cdn.nilaloutfits.com  (custom domain) or the
//                           bucket's r2.dev URL. No trailing slash.

// Read env lazily (at call time) rather than into module-level constants. ES
// module imports execute before dotenv.config() runs in entry files, so caching
// these at import time would capture empty values. Getters keep it order-safe.
export const getR2Bucket = () => process.env.R2_BUCKET || '';
export const getR2PublicBaseUrl = () =>
  String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

export const isR2Configured = () =>
  Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    getR2Bucket() &&
    getR2PublicBaseUrl()
  );

let client = null;

export const getR2Client = () => {
  if (!isR2Configured()) {
    throw new Error(
      'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_BASE_URL.'
    );
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
};

// Public URL for an object key. Keys never start with a slash.
export const buildR2PublicUrl = (key) => `${getR2PublicBaseUrl()}/${String(key).replace(/^\/+/, '')}`;
