import { isR2Configured } from '../config/r2.js';
import { optimizeImageBuffer } from '../utils/imageOptimize.js';
import { uploadBufferToR2, buildProductImageKey } from '../utils/r2Upload.js';

export const uploadMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File is required' });
    }

    if (!isR2Configured()) {
      return res.status(503).json({
        message: 'Image storage is not configured. Set the R2_* environment variables.',
      });
    }

    // Optimize (resize + WebP) before storing so every uploaded image is small
    // and consistently formatted, then push straight to R2 and return its URL.
    const optimized = await optimizeImageBuffer(req.file.buffer);
    const key = buildProductImageKey();
    const url = await uploadBufferToR2(optimized, key);

    res.status(200).json({ url });
  } catch (error) {
    console.error('Media upload error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
