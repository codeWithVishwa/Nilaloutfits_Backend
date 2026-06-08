import sharp from 'sharp';

// Product imagery never needs to be wider than this on the storefront; capping
// the longest edge plus WebP encoding is where the ~80-90% size win comes from.
const MAX_EDGE = 1600;
const WEBP_QUALITY = 80;

export const OPTIMIZED_CONTENT_TYPE = 'image/webp';
export const OPTIMIZED_EXTENSION = 'webp';

// Take a raw image buffer and return an optimized WebP buffer. Resizes down to
// MAX_EDGE (never upscales) and strips metadata. Animated GIFs are flattened to
// a static WebP frame, which is fine for catalog images.
export const optimizeImageBuffer = async (inputBuffer) => {
  return sharp(inputBuffer, { failOn: 'none' })
    .rotate() // respect EXIF orientation before stripping metadata
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
};
