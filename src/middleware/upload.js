import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary.js';

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

const upload = storage ? multer({ storage }) : multer({ dest: 'uploads/' });

export default upload;
