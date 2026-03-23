import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Variant from '../models/Variant.js';

const normalizeVariantQuantityEntries = (variantQuantities) => {
  if (variantQuantities instanceof Map) {
    return [...variantQuantities.entries()]
      .map(([variantId, quantity]) => ({
        variantId: String(variantId || '').trim(),
        quantity: Number(quantity || 0),
      }))
      .filter((entry) => entry.variantId && Number.isFinite(entry.quantity) && entry.quantity > 0);
  }

  if (Array.isArray(variantQuantities)) {
    return variantQuantities
      .map((entry) => ({
        variantId: String(entry?.variantId || '').trim(),
        quantity: Number(entry?.quantity || 0),
      }))
      .filter((entry) => entry.variantId && Number.isFinite(entry.quantity) && entry.quantity > 0);
  }

  return [];
};

const applyVariantStockDelta = async ({ variantId, quantityDelta, minimumAvailable = 0, session } = {}) => {
  const filter = { _id: variantId };
  if (minimumAvailable > 0) {
    filter.stock = { $gte: minimumAvailable };
  }

  let query = Variant.findOneAndUpdate(
    filter,
    [
      {
        $set: {
          stock: {
            $max: [
              0,
              {
                $add: ['$stock', quantityDelta],
              },
            ],
          },
        },
      },
      {
        $set: {
          availability: {
            $cond: [{ $gt: ['$stock', 0] }, 'InStock', 'OutOfStock'],
          },
        },
      },
    ],
    { new: true }
  );

  if (session) {
    query = query.session(session);
  }

  return query;
};

export const syncProductStockFromVariants = async (productIds = [], { session } = {}) => {
  const normalizedProductIds = [...new Set(
    productIds
      .map((productId) => String(productId || '').trim())
      .filter((productId) => mongoose.Types.ObjectId.isValid(productId))
  )];

  if (!normalizedProductIds.length) return;

  const objectIds = normalizedProductIds.map((productId) => new mongoose.Types.ObjectId(productId));
  let aggregateQuery = Variant.aggregate([
    { $match: { productId: { $in: objectIds } } },
    {
      $group: {
        _id: '$productId',
        totalStock: { $sum: { $max: ['$stock', 0] } },
      },
    },
  ]);

  if (session) {
    aggregateQuery = aggregateQuery.session(session);
  }

  const stockRows = await aggregateQuery;
  const stockByProductId = new Map(
    stockRows.map((row) => [String(row._id), Number(row.totalStock || 0)])
  );

  for (const productId of normalizedProductIds) {
    let query = Product.findByIdAndUpdate(
      productId,
      { stock: stockByProductId.get(productId) || 0 },
      { new: true }
    );

    if (session) {
      query = query.session(session);
    }

    await query;
  }
};

export const reserveVariantStock = async (variantQuantities, { session } = {}) => {
  const entries = normalizeVariantQuantityEntries(variantQuantities);
  const reservedEntries = [];
  const updatedVariants = [];

  try {
    for (const entry of entries) {
      const updatedVariant = await applyVariantStockDelta({
        variantId: entry.variantId,
        quantityDelta: -entry.quantity,
        minimumAvailable: entry.quantity,
        session,
      });

      if (!updatedVariant) {
        throw new Error('Insufficient stock');
      }

      reservedEntries.push(entry);
      updatedVariants.push(updatedVariant);
    }

    await syncProductStockFromVariants(
      updatedVariants.map((variant) => variant.productId),
      { session }
    );

    return { adjustments: reservedEntries, updatedVariants };
  } catch (error) {
    if (!session && reservedEntries.length) {
      const rollbackVariants = [];
      for (const entry of reservedEntries) {
        const rolledBackVariant = await applyVariantStockDelta({
          variantId: entry.variantId,
          quantityDelta: entry.quantity,
        });

        if (rolledBackVariant) {
          rollbackVariants.push(rolledBackVariant);
        }
      }

      if (rollbackVariants.length) {
        await syncProductStockFromVariants(rollbackVariants.map((variant) => variant.productId));
      }
    }

    throw error;
  }
};

export const restoreVariantStock = async (variantQuantities, { session } = {}) => {
  const entries = normalizeVariantQuantityEntries(variantQuantities);
  const updatedVariants = [];

  for (const entry of entries) {
    const updatedVariant = await applyVariantStockDelta({
      variantId: entry.variantId,
      quantityDelta: entry.quantity,
      session,
    });

    if (updatedVariant) {
      updatedVariants.push(updatedVariant);
    }
  }

  if (updatedVariants.length) {
    await syncProductStockFromVariants(
      updatedVariants.map((variant) => variant.productId),
      { session }
    );
  }

  return { adjustments: entries, updatedVariants };
};

export const buildVariantQuantityMapFromOrderItems = (items = []) => {
  const requestedQtyByVariant = new Map();

  for (const item of items) {
    const variantId = String(item?.variantId || '').trim();
    const quantity = Number(item?.quantity || 0);
    if (!variantId || !Number.isFinite(quantity) || quantity <= 0) continue;
    requestedQtyByVariant.set(variantId, (requestedQtyByVariant.get(variantId) || 0) + quantity);
  }

  return requestedQtyByVariant;
};
