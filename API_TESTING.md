# API Testing Guide - Product Endpoints

## Quick Test Commands

### 1. Test Basic Pagination
```bash
# First page (products 1-12)
curl "http://localhost:5000/api/products?limit=12&skip=0"

# Second page (products 13-24)
curl "http://localhost:5000/api/products?limit=12&skip=12"

# Third page (products 25-36)
curl "http://localhost:5000/api/products?limit=12&skip=24"
```

### 2. Test Category Filtering
```bash
# Get products by category
curl "http://localhost:5000/api/products?categoryId=YOUR_CATEGORY_ID&limit=12&skip=0"

# Get products by subcategory
curl "http://localhost:5000/api/products?subcategoryId=YOUR_SUBCATEGORY_ID&limit=12&skip=0"
```

### 3. Test Sorting
```bash
# Sort by price (low to high)
curl "http://localhost:5000/api/products?sort=price:asc&limit=12&skip=0"

# Sort by price (high to low)
curl "http://localhost:5000/api/products?sort=price:desc&limit=12&skip=0"

# Sort by newest
curl "http://localhost:5000/api/products?sort=new&limit=12&skip=0"

# Sort by best-selling
curl "http://localhost:5000/api/products?sort=best-selling&limit=12&skip=0"
```

### 4. Test Search
```bash
# Text search
curl "http://localhost:5000/api/products?q=shirt&limit=12&skip=0"
```

### 5. Test Combined Filters
```bash
# Category + Sort + Pagination
curl "http://localhost:5000/api/products?categoryId=XXX&sort=price:asc&limit=12&skip=0"

# Search + Category + Pagination
curl "http://localhost:5000/api/products?q=shirt&categoryId=XXX&limit=12&skip=0"
```

## Expected Response Format

```json
{
  "data": [
    {
      "_id": "...",
      "title": "Product Name",
      "price": 1999,
      "status": "Active",
      "categoryId": "...",
      "images": ["..."],
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 112,
  "totalPages": 10,
  "currentPage": 1,
  "limit": 12
}
```

## Response Field Descriptions

- `data`: Array of product objects (max length = limit)
- `total`: Total number of products matching the filter
- `totalPages`: Calculated as Math.ceil(total / limit)
- `currentPage`: Current page number (calculated from skip and limit)
- `limit`: Number of items per page

## Validation Tests

### Test 1: Verify Total Count
```bash
# Should return total count of active products
curl "http://localhost:5000/api/products?limit=1&skip=0" | jq '.total'
```

### Test 2: Verify Pagination Math
```bash
# If total = 112 and limit = 12, totalPages should be 10
curl "http://localhost:5000/api/products?limit=12&skip=0" | jq '{total, totalPages, limit}'
```

### Test 3: Verify Last Page
```bash
# Last page should have remaining products (112 % 12 = 4 products)
curl "http://localhost:5000/api/products?limit=12&skip=108" | jq '.data | length'
```

### Test 4: Verify Empty Filters Don't Break
```bash
# Empty categoryId should be ignored
curl "http://localhost:5000/api/products?categoryId=&limit=12&skip=0"
```

### Test 5: Verify Status Filter
```bash
# Should only return Active products
curl "http://localhost:5000/api/products?limit=100&skip=0" | jq '.data[].status' | sort | uniq
# Expected output: "Active" only
```

## MongoDB Verification

### Check Product Counts
```javascript
// In MongoDB shell or Compass
db.products.countDocuments({})                    // All products
db.products.countDocuments({ status: "Active" })  // Active only
db.products.countDocuments({ status: "Inactive" }) // Inactive only
```

### Check Category Distribution
```javascript
db.products.aggregate([
  { $match: { status: "Active" } },
  { $group: { _id: "$categoryId", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
])
```

### Sample Products
```javascript
db.products.find({ status: "Active" }).limit(5).pretty()
```

## Common Issues & Solutions

### Issue: Only 12 products showing
**Cause**: Frontend not implementing pagination correctly
**Solution**: Ensure frontend increments `skip` parameter: `skip = (page - 1) * limit`

### Issue: Wrong total count
**Cause**: Filter mismatch between find() and countDocuments()
**Solution**: Fixed - both now use same filter object

### Issue: Empty results with filters
**Cause**: Empty string filters being applied
**Solution**: Fixed - empty strings are now trimmed and ignored

### Issue: Inactive products showing
**Cause**: Missing status filter
**Solution**: Fixed - always filters by status: "Active" by default

## Performance Benchmarks

Expected response times (with 112 products):
- Simple query (no filters): < 50ms
- With category filter: < 50ms
- With text search: < 100ms
- With best-selling sort: < 200ms (includes aggregation)

## Testing Script

Run the automated test script:
```bash
cd Backend
node scripts/test-pagination.js
```

Expected output:
```
✅ Connected to MongoDB

📊 Total products in DB: 112
✅ Active products: 112
❌ Inactive products: 0

📄 Total pages (12 per page): 10

📄 Page 1: 12 products
📄 Page 2: 12 products
📄 Page 10 (last): 4 products

📊 Products by category:
   Category XXX: 45 products
   Category YYY: 38 products
   Category ZZZ: 29 products

✅ All tests completed successfully!
```

## Frontend Integration

The frontend should call the API like this:

```javascript
const fetchProducts = async (page = 1, limit = 12, filters = {}) => {
  const skip = (page - 1) * limit;
  
  const params = {
    limit,
    skip,
    ...filters
  };
  
  const response = await api.get('/products', { params });
  
  return {
    products: response.data.data,
    total: response.data.total,
    totalPages: response.data.totalPages,
    currentPage: response.data.currentPage
  };
};
```

## Production Deployment Checklist

- [ ] Test with production database
- [ ] Verify all 112 products are accessible via pagination
- [ ] Test with real category IDs
- [ ] Test with various filter combinations
- [ ] Monitor response times
- [ ] Check error logs for any issues
- [ ] Verify frontend displays all pages correctly
- [ ] Test on mobile devices
- [ ] Verify SEO pagination (if applicable)
