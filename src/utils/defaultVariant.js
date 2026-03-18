import Product from '../models/Product.js';
import Variant from '../models/Variant.js';

export const buildAutoVariantSku = (productId) => `AUTO-${String(productId)}`.toUpperCase();

export const syncAutoVariantForProduct = async (productOrId) => {
  const product =
    productOrId && typeof productOrId === 'object' && productOrId._id
      ? productOrId
      : await Product.findById(productOrId).select('_id price stock');

  if (!product?._id) return null;

  const productId = String(product._id);
  const autoSku = buildAutoVariantSku(productId);
  const variants = await Variant.find({ productId }).sort({ createdAt: 1 });

  const hasManagedVariants = variants.some((variant) => {
    const normalizedSize = String(variant.size || '').toUpperCase();
    const normalizedSku = String(variant.sku || '').toUpperCase();
    return normalizedSize !== 'ONE_SIZE' || normalizedSku !== autoSku;
  });

  if (hasManagedVariants) {
    return null;
  }

  const stock = Number(product.stock || 0);
  const price = Number(product.price || 0);
  const availability = stock > 0 ? 'InStock' : 'OutOfStock';
  let autoVariant = variants.find((variant) => String(variant.sku || '').toUpperCase() === autoSku) || variants[0] || null;

  if (autoVariant) {
    const needsUpdate =
      String(autoVariant.size || '').toUpperCase() !== 'ONE_SIZE' ||
      String(autoVariant.sku || '').toUpperCase() !== autoSku ||
      Number(autoVariant.price || 0) !== price ||
      Number(autoVariant.stock || 0) !== stock ||
      String(autoVariant.availability || '') !== availability;

    if (needsUpdate) {
      autoVariant.size = 'ONE_SIZE';
      autoVariant.sku = autoSku;
      autoVariant.price = price;
      autoVariant.stock = stock;
      autoVariant.availability = availability;
      await autoVariant.save();
    }

    return autoVariant;
  }

  return Variant.create({
    productId,
    size: 'ONE_SIZE',
    sku: autoSku,
    price,
    stock,
    availability,
  });
};
