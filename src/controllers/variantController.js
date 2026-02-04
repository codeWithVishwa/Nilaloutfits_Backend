import Variant from '../models/Variant.js';
import { emitStockUpdate } from '../socket/index.js';

export const createVariant = async (req, res) => {
  try {
    const { productId, size, color, sku, price, stock } = req.body;
    if (!productId || !size || !sku || price === undefined || stock === undefined) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const availability = stock > 0 ? 'InStock' : 'OutOfStock';
    const variant = await Variant.create({
      productId,
      size,
      color,
      sku,
      price,
      stock,
      availability,
    });

    emitStockUpdate(variant);
    res.status(201).json(variant);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    if (updates.stock !== undefined) {
      updates.availability = updates.stock > 0 ? 'InStock' : 'OutOfStock';
    }

    const variant = await Variant.findByIdAndUpdate(id, updates, { new: true });
    if (!variant) return res.status(404).json({ message: 'Variant not found' });

    emitStockUpdate(variant);
    res.status(200).json(variant);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const variant = await Variant.findByIdAndDelete(id);
    if (!variant) return res.status(404).json({ message: 'Variant not found' });
    emitStockUpdate({ _id: id, deleted: true });
    res.status(200).json({ message: 'Variant deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const listVariantsByProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const variants = await Variant.find({ productId });
    res.status(200).json(variants);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
