import multer from 'multer';

// Images are buffered in memory so they can be optimized (resized + WebP) and
// streamed straight to Cloudflare R2 — no local disk writes. Cap the upload size
// and accept images only.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB raw upload ceiling
  fileFilter: (req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image uploads are allowed'));
    }
  },
});

export default upload;
