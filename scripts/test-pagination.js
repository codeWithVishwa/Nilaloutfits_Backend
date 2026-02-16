/**
 * Test script to verify pagination fix
 * Run with: node scripts/test-pagination.js
 */

import mongoose from 'mongoose';
import Product from '../src/models/Product.js';
import dotenv from 'dotenv';

dotenv.config();

const testPagination = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Test 1: Count all products
    const totalProducts = await Product.countDocuments({});
    console.log(`📊 Total products in DB: ${totalProducts}`);

    // Test 2: Count active products
    const activeProducts = await Product.countDocuments({ status: 'Active' });
    console.log(`✅ Active products: ${activeProducts}`);

    // Test 3: Count inactive products
    const inactiveProducts = await Product.countDocuments({ status: 'Inactive' });
    console.log(`❌ Inactive products: ${inactiveProducts}\n`);

    // Test 4: Pagination simulation
    const limit = 12;
    const totalPages = Math.ceil(activeProducts / limit);
    console.log(`📄 Total pages (12 per page): ${totalPages}\n`);

    // Test 5: Fetch first page
    const page1 = await Product.find({ status: 'Active' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(0)
      .lean();
    console.log(`📄 Page 1: ${page1.length} products`);

    // Test 6: Fetch second page
    const page2 = await Product.find({ status: 'Active' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(12)
      .lean();
    console.log(`📄 Page 2: ${page2.length} products`);

    // Test 7: Fetch last page
    const lastPageSkip = (totalPages - 1) * limit;
    const lastPage = await Product.find({ status: 'Active' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(lastPageSkip)
      .lean();
    console.log(`📄 Page ${totalPages} (last): ${lastPage.length} products\n`);

    // Test 8: Category breakdown
    const categories = await Product.aggregate([
      { $match: { status: 'Active' } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    console.log('📊 Products by category:');
    categories.forEach(cat => {
      console.log(`   Category ${cat._id}: ${cat.count} products`);
    });

    console.log('\n✅ All tests completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

testPagination();
