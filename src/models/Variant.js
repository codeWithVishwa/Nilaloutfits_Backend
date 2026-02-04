import mongoose from 'mongoose';

const variantSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    size: { type: String, required: true },
    color: { type: String },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0 },
    availability: { type: String, enum: ['InStock', 'OutOfStock'], default: 'InStock' },
  },
  { timestamps: true }
);

variantSchema.index({ productId: 1, size: 1, color: 1 }, { unique: true });
variantSchema.index({ availability: 1, stock: 1 });

const Variant = mongoose.model('Variant', variantSchema);

export default Variant;
