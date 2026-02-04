import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Variant', required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String },
    verified: { type: Boolean, default: true },
  },
  { timestamps: true }
);

reviewSchema.index({ userId: 1, orderId: 1, variantId: 1 }, { unique: true });
reviewSchema.index({ productId: 1 });

const Review = mongoose.model('Review', reviewSchema);

export default Review;
