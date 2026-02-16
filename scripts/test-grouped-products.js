/**
 * Test script for grouped products and bulk variant creation
 * 
 * Usage:
 * 1. Set your admin JWT token in the TOKEN variable below
 * 2. Run: node scripts/test-grouped-products.js
 */

import axios from 'axios';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:5000/api';
const TOKEN = 'YOUR_ADMIN_TOKEN_HERE'; // Replace with your actual admin token

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  }
});

async function testGroupedProducts() {
  console.log('\n🧪 Testing Grouped Products API\n');
  console.log('='.repeat(50));

  try {
    // Test 1: Fetch grouped products
    console.log('\n📋 Test 1: Fetching grouped products...');
    const { data: grouped } = await api.get('/admin/products-grouped');
    
    console.log(`✅ Success! Found ${grouped.length} unique product titles`);
    
    if (grouped.length === 0) {
      console.log('⚠️  No products found. Make sure you have products in your database.');
      return;
    }

    // Display first few grouped products
    console.log('\n📦 Sample grouped products:');
    grouped.slice(0, 3).forEach((product, index) => {
      console.log(`\n${index + 1}. ${product.title}`);
      console.log(`   - Duplicates: ${product.count}`);
      console.log(`   - Product IDs: ${product.productIds.length}`);
      console.log(`   - Price: ₹${product.price}`);
      console.log(`   - Brand: ${product.brand || 'N/A'}`);
    });

    // Find a product with duplicates for testing
    const productWithDuplicates = grouped.find(p => p.count > 1);
    
    if (!productWithDuplicates) {
      console.log('\n⚠️  No duplicate products found. Creating variants for first product instead.');
      const testProduct = grouped[0];
      await testBulkVariantCreation(testProduct);
    } else {
      console.log(`\n🎯 Found product with duplicates: "${productWithDuplicates.title}" (${productWithDuplicates.count} duplicates)`);
      await testBulkVariantCreation(productWithDuplicates);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n💡 Tip: Make sure to set a valid admin token in the TOKEN variable');
    }
  }
}

async function testBulkVariantCreation(product) {
  console.log('\n' + '='.repeat(50));
  console.log('\n🔧 Test 2: Creating bulk variants...');
  
  const testSizes = ['S', 'M', 'L'];
  const testColor = 'Test-Black';

  console.log(`\n📝 Test parameters:`);
  console.log(`   - Product: ${product.title}`);
  console.log(`   - Product IDs: ${product.productIds.length}`);
  console.log(`   - Sizes: ${testSizes.join(', ')}`);
  console.log(`   - Color: ${testColor}`);
  console.log(`   - Expected variants: ${product.productIds.length * testSizes.length}`);

  try {
    const { data: result } = await api.post('/variants/bulk', {
      productIds: product.productIds,
      sizes: testSizes,
      color: testColor
    });

    console.log('\n✅ Bulk variant creation completed!');
    console.log('\n📊 Summary:');
    console.log(`   - Total products: ${result.summary.totalProducts}`);
    console.log(`   - Total sizes: ${result.summary.totalSizes}`);
    console.log(`   - Created: ${result.summary.created}`);
    console.log(`   - Updated: ${result.summary.updated}`);
    console.log(`   - Skipped: ${result.summary.skipped}`);

    if (result.results.created.length > 0) {
      console.log('\n✨ Sample created variants:');
      result.results.created.slice(0, 3).forEach((variant, index) => {
        console.log(`\n${index + 1}. SKU: ${variant.sku}`);
        console.log(`   - Size: ${variant.size}`);
        console.log(`   - Color: ${variant.color}`);
        console.log(`   - Price: ₹${variant.price}`);
        console.log(`   - Stock: ${variant.stock}`);
        console.log(`   - Availability: ${variant.availability}`);
      });
    }

    if (result.results.skipped.length > 0) {
      console.log('\n⏭️  Skipped variants:');
      result.results.skipped.slice(0, 3).forEach((skipped, index) => {
        console.log(`${index + 1}. Product: ${skipped.productId}, Size: ${skipped.size} - ${skipped.reason}`);
      });
    }

    // Test 3: Try creating the same variants again (should skip)
    console.log('\n' + '='.repeat(50));
    console.log('\n🔄 Test 3: Testing duplicate prevention...');
    console.log('Creating the same variants again (should skip all)...');

    const { data: duplicateResult } = await api.post('/variants/bulk', {
      productIds: product.productIds,
      sizes: testSizes,
      color: testColor
    });

    console.log('\n✅ Duplicate prevention test completed!');
    console.log(`   - Created: ${duplicateResult.summary.created} (should be 0)`);
    console.log(`   - Skipped: ${duplicateResult.summary.skipped} (should be ${product.productIds.length * testSizes.length})`);

    if (duplicateResult.summary.created === 0 && duplicateResult.summary.skipped > 0) {
      console.log('\n🎉 Perfect! Duplicate prevention is working correctly.');
    } else {
      console.log('\n⚠️  Warning: Duplicate prevention may not be working as expected.');
    }

  } catch (error) {
    console.error('\n❌ Error creating variants:', error.response?.data || error.message);
  }
}

async function cleanup() {
  console.log('\n' + '='.repeat(50));
  console.log('\n🧹 Cleanup (Optional)');
  console.log('\nTo remove test variants, you can:');
  console.log('1. Use MongoDB Compass to delete variants with color "Test-Black"');
  console.log('2. Or run: db.variants.deleteMany({ color: "Test-Black" })');
  console.log('\nTest variants were created with color "Test-Black" for easy identification.');
}

// Run tests
console.log('\n🚀 Starting Grouped Products API Tests');
console.log('Make sure your backend is running on', API_BASE);

if (TOKEN === 'YOUR_ADMIN_TOKEN_HERE') {
  console.log('\n❌ Error: Please set your admin token in the TOKEN variable');
  console.log('💡 Get your token by logging in as admin and copying it from localStorage');
  process.exit(1);
}

testGroupedProducts()
  .then(() => {
    cleanup();
    console.log('\n✅ All tests completed!\n');
  })
  .catch((error) => {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  });
