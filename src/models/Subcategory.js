import mongoose from 'mongoose';

const subcategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    parentCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    parentSubcategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subcategory',
      default: null,
    },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true }
);

subcategorySchema.index({ parentCategoryId: 1 });
subcategorySchema.index({ parentCategoryId: 1, parentSubcategoryId: 1 });
subcategorySchema.index({ parentCategoryId: 1, parentSubcategoryId: 1, slug: 1 }, { unique: true });

const Subcategory = mongoose.model('Subcategory', subcategorySchema);

export default Subcategory;
