import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, lowercase: true, trim: true },
    description: { type: String },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    subcategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory' },
    brand: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0 },
    images: [{ type: String }],
    colorVariants: [
      {
        name: { type: String, trim: true },
        images: [{ type: String }],
      },
    ],
    tags: [{ type: String, lowercase: true, trim: true }],
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    featuredBestSelling: { type: Boolean, default: false },
    featuredRecent: { type: Boolean, default: false },
    featuredVariantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Variant' }],
    avgRating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.index({ title: 'text', description: 'text', tags: 'text' });
productSchema.index({ categoryId: 1, subcategoryId: 1 });

const Product = mongoose.model('Product', productSchema);

export default Product;
