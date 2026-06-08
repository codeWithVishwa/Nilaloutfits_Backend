import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { getR2Client, getR2Bucket, buildR2PublicUrl } from '../config/r2.js';
import { OPTIMIZED_CONTENT_TYPE, OPTIMIZED_EXTENSION } from './imageOptimize.js';

// Upload a buffer to R2 under the given key and return its public URL. Objects
// are served via R2_PUBLIC_BASE_URL (custom domain or r2.dev), and we set a long
// immutable cache because keys are unique per upload.
export const uploadBufferToR2 = async (
  buffer,
  key,
  { contentType = OPTIMIZED_CONTENT_TYPE } = {}
) => {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  return buildR2PublicUrl(key);
};

// Build a collision-resistant object key for an optimized product image.
export const buildProductImageKey = () => `products/${Date.now()}-${randomUUID()}.${OPTIMIZED_EXTENSION}`;
