# Grouped Products API Documentation

## Endpoints

### 1. Get Grouped Products

Groups products by title and returns aggregated data.

**Endpoint:** `GET /api/admin/products-grouped`

**Authentication:** Required (Admin role)

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
[
  {
    "title": "Classic Cotton T-Shirt",
    "productIds": [
      "507f1f77bcf86cd799439011",
      "507f1f77bcf86cd799439012",
      "507f1f77bcf86cd799439013"
    ],
    "count": 3,
    "image": "https://cloudinary.com/image.jpg",
    "price": 599,
    "categoryId": "507f1f77bcf86cd799439020",
    "brand": "Nike"
  },
  {
    "title": "Slim Fit Jeans",
    "productIds": [
      "507f1f77bcf86cd799439014",
      "507f1f77bcf86cd799439015"
    ],
    "count": 2,
    "image": "https://cloudinary.com/jeans.jpg",
    "price": 1299,
    "categoryId": "507f1f77bcf86cd799439021",
    "brand": "Levi's"
  }
]
```

**Sorting:**
- Primary: By count (descending) - products with most duplicates first
- Secondary: By title (ascending) - alphabetical order

---

### 2. Bulk Create Variants

Creates variants for multiple products at once with duplicate prevention.

**Endpoint:** `POST /api/variants/bulk`

**Authentication:** Required (CATALOG_WRITE permission)

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "productIds": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012"
  ],
  "sizes": ["S", "M", "L", "XL"],
  "color": "Black"
}
```

**Parameters:**
- `productIds` (required): Array of product IDs to create variants for
- `sizes` (required): Array of size strings (e.g., ["S", "M", "L"])
- `color` (optional): Color name for the variants

**Response:** `201 Created`
```json
{
  "message": "Bulk variant creation completed",
  "summary": {
    "totalProducts": 2,
    "totalSizes": 4,
    "created": 8,
    "updated": 0,
    "skipped": 0
  },
  "results": {
    "created": [
      {
        "_id": "507f1f77bcf86cd799439030",
        "productId": "507f1f77bcf86cd799439011",
        "size": "S",
        "color": "Black",
        "sku": "CLA-S-507F1F",
        "price": 599,
        "stock": 50,
        "availability": "InStock",
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      }
      // ... more variants
    ],
    "updated": [],
    "skipped": [
      {
        "productId": "507f1f77bcf86cd799439012",
        "size": "M",
        "reason": "Already exists"
      }
    ]
  }
}
```

**Error Responses:**

`400 Bad Request` - Missing required fields
```json
{
  "message": "productIds array is required"
}
```

`404 Not Found` - No products found
```json
{
  "message": "No products found"
}
```

`500 Server Error`
```json
{
  "message": "Server error",
  "error": "Error details"
}
```

---

## Usage Examples

### Example 1: Fetch Grouped Products

```javascript
const token = localStorage.getItem('token');

const response = await fetch('http://localhost:5000/api/admin/products-grouped', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const groupedProducts = await response.json();
console.log(groupedProducts);
```

### Example 2: Create Variants for Duplicate Products

```javascript
const token = localStorage.getItem('token');

// User selected "Classic T-Shirt" which has 3 duplicate products
const selectedProduct = {
  title: "Classic T-Shirt",
  productIds: ["id1", "id2", "id3"],
  count: 3
};

// User selected sizes S, M, L
const response = await fetch('http://localhost:5000/api/variants/bulk', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    productIds: selectedProduct.productIds,
    sizes: ['S', 'M', 'L'],
    color: 'Black'
  })
});

const result = await response.json();
console.log(`Created ${result.summary.created} variants`);
console.log(`Skipped ${result.summary.skipped} existing variants`);
```

### Example 3: Using Axios

```javascript
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';
const token = localStorage.getItem('token');

// Fetch grouped products
const { data: products } = await axios.get(
  `${API_BASE}/admin/products-grouped`,
  {
    headers: { Authorization: `Bearer ${token}` }
  }
);

// Create variants
const { data: result } = await axios.post(
  `${API_BASE}/variants/bulk`,
  {
    productIds: products[0].productIds,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL']
  },
  {
    headers: { Authorization: `Bearer ${token}` }
  }
);
```

---

## Business Logic

### Variant Creation Rules

1. **Upsert Strategy:** Uses MongoDB's `updateOne` with `upsert: true`
   - If variant exists (same productId + size + color): Skip
   - If variant doesn't exist: Create new

2. **SKU Generation:**
   - Format: `{TITLE_PREFIX}-{SIZE}-{PRODUCT_ID_PREFIX}`
   - Example: `CLA-M-507F1F`
   - Ensures uniqueness per product

3. **Price & Stock Inheritance:**
   - Copies from parent product
   - Can be updated individually later

4. **Availability Calculation:**
   - `InStock` if stock > 0
   - `OutOfStock` if stock = 0

5. **Real-time Updates:**
   - Emits socket events for each created variant
   - Keeps frontend inventory in sync

### Duplicate Prevention

The unique compound index prevents duplicates:
```javascript
variantSchema.index({ productId: 1, size: 1, color: 1 }, { unique: true });
```

If you try to create a variant that already exists:
- MongoDB returns `modifiedCount: 0`
- Variant is added to `skipped` array
- No error is thrown
- Operation continues for other variants

---

## Testing with cURL

### Get Grouped Products
```bash
curl -X GET http://localhost:5000/api/admin/products-grouped \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Create Bulk Variants
```bash
curl -X POST http://localhost:5000/api/variants/bulk \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "productIds": ["PRODUCT_ID_1", "PRODUCT_ID_2"],
    "sizes": ["S", "M", "L", "XL"],
    "color": "Navy Blue"
  }'
```

---

## Performance Considerations

1. **Aggregation Performance:**
   - Ensure index on `title` field
   - Ensure index on `status` field
   - Aggregation runs on active products only

2. **Bulk Creation:**
   - Processes variants sequentially
   - Catches individual errors without stopping
   - Returns detailed results for debugging

3. **Recommended Limits:**
   - Max 100 products per bulk operation
   - Max 10 sizes per operation
   - Total variants per request: ~1000

---

## Error Handling

The API handles these scenarios gracefully:

- Missing required fields → 400 Bad Request
- Invalid product IDs → 404 Not Found
- Duplicate variants → Skipped (not error)
- Database errors → 500 with error details
- Authentication failures → 401 Unauthorized
- Permission denied → 403 Forbidden
