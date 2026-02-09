import multer from 'multer';
import path from 'path';
import dotenv from 'dotenv';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary.js';

dotenv.config();

const hasCloudinary = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

const storage = hasCloudinary
  ? new CloudinaryStorage({
      cloudinary,
      params: {
        folder: 'nilaloutfits',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      },
    })
  : null;

const diskStorage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  },
});

const upload = storage ? multer({ storage }) : multer({ storage: diskStorage });

export default upload;
