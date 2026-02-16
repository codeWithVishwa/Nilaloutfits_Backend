# Grouped Products - API Examples

## Complete Request/Response Examples

### Example 1: Get Grouped Products

#### Request
```http
GET /api/admin/products-grouped HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response (200 OK)
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
    "image": "https://res.cloudinary.com/demo/image/upload/v1234567890/tshirt.jpg",
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
    "image": "https://res.cloudinary.com/demo/image/upload/v1234567890/jeans.jpg",
    "price": 1299,
    "categoryId": "507f1f77bcf86cd799439021",
    "brand": "Levi's"
  },
  {
    "title": "Casual Hoodie",
    "productIds": [
      "507f1f77bcf86cd799439016"
    ],
    "count": 1,
    "image": "https://res.cloudinary.com/demo/image/upload/v1234567890/hoodie.jpg",
    "price": 899,
    "categoryId": "507f1f77bcf86cd799439022",
    "brand": "Adidas"
  }
]
```

---

### Example 2: Create Bulk Variants (Success)

#### Request
```http
POST /api/variants/bulk HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "productIds": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012"
  ],
  "sizes": ["S", "M", "L", "XL"],
  "color": "Black"
}
```

#### Response (201 Created)
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
      },
      {
        "_id": "507f1f77bcf86cd799439031",
        "productId": "507f1f77bcf86cd799439011",
        "size": "M",
        "color": "Black",
        "sku": "CLA-M-507F1F",
        "price": 599,
        "stock": 50,
        "availability": "InStock",
        "createdAt": "2024-01-15T10:30:01.000Z",
        "updatedAt": "2024-01-15T10:30:01.000Z"
      },
      {
        "_id": "507f1f77bcf86cd799439032",
        "productId": "507f1f77bcf86cd799439011",
        "size": "L",
        "color": "Black",
        "sku": "CLA-L-507F1F",
        "price": 599,
        "stock": 50,
        "availability": "InStock",
        "createdAt": "2024-01-15T10:30:02.000Z",
        "updatedAt": "2024-01-15T10:30:02.000Z"
      },
      {
        "_id": "507f1f77bcf86cd799439033",
        "productId": "507f1f77bcf86cd799439011",
        "size": "XL",
        "color": "Black",
        "sku": "CLA-XL-507F1F",
        "price": 599,
        "stock": 50,
        "availability": "InStock",
        "createdAt": "2024-01-15T10:30:03.000Z",
        "updatedAt": "2024-01-15T10:30:03.000Z"
      },
      {
        "_id": "507f1f77bcf86cd799439034",
        "productId": "507f1f77bcf86cd799439012",
        "size": "S",
        "color": "Black",
        "sku": "CLA-S-507F20",
        "price": 599,
        "stock": 50,
        "availability": "InStock",
        "createdAt": "2024-01-15T10:30:04.000Z",
        "updatedAt": "2024-01-15T10:30:04.000Z"
      },
      {
        "_id": "507f1f77bcf86cd799439035",
        "productId": "507f1f77bcf86cd799439012",
        "size": "M",
        "color": "Black",
        "sku": "CLA-M-507F20",
        "price": 599,
        "stock": 50,
        "availability": "InStock",
        "createdAt": "2024-01-15T10:30:05.000Z",
        "updatedAt": "2024-01-15T10:30:05.000Z"
      },
      {
        "_id": "507f1f77bcf86cd799439036",
        "productId": "507f1f77bcf86cd799439012",
        "size": "L",
        "color": "Black",
        "sku": "CLA-L-507F20",
        "price": 599,
        "stock": 50,
        "availability": "InStock",
        "createdAt": "2024-01-15T10:30:06.000Z",
        "updatedAt": "2024-01-15T10:30:06.000Z"
      },
      {
        "_id": "507f1f77bcf86cd799439037",
        "productId": "507f1f77bcf86cd799439012",
        "size": "XL",
        "color": "Black",
        "sku": "CLA-XL-507F20",
        "price": 599,
        "stock": 50,
        "availability": "InStock",
        "createdAt": "2024-01-15T10:30:07.000Z",
        "updatedAt": "2024-01-15T10:30:07.000Z"
      }
    ],
    "updated": [],
    "skipped": []
  }
}
```

---

### Example 3: Create Bulk Variants (With Skipped)

#### Request
```http
POST /api/variants/bulk HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "productIds": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012"
  ],
  "sizes": ["S", "M", "L"],
  "color": "Black"
}
```

#### Response (201 Created)
```json
{
  "message": "Bulk variant creation completed",
  "summary": {
    "totalProducts": 2,
    "totalSizes": 3,
    "created": 4,
    "updated": 0,
    "skipped": 2
  },
  "results": {
    "created": [
      {
        "_id": "507f1f77bcf86cd799439040",
        "productId": "507f1f77bcf86cd799439011",
        "size": "L",
        "color": "Black",
        "sku": "CLA-L-507F1F",
        "price": 599,
        "stock": 50,
        "availability": "InStock",
        "createdAt": "2024-01-15T11:00:00.000Z",
        "updatedAt": "2024-01-15T11:00:00.000Z"
      },
      {
        "_id": "507f1f77bcf86cd799439041",
        "productId": "507f1f77bcf86cd799439012",
        "size": "S",
        "color": "Black",
        "sku": "CLA-S-507F20",
        "price": 599,
        "stock": 50,
        "availability": "InStock",
        "createdAt": "2024-01-15T11:00:01.000Z",
        "updatedAt": "2024-01-15T11:00:01.000Z"
      },
      {
        "_id": "507f1f77bcf86cd799439042",
        "productId": "507f1f77bcf86cd799439012",
        "size": "M",
        "color": "Black",
        "sku": "CLA-M-507F20",
        "price": 599,
        "stock": 50,
        "availability": "InStock",
        "createdAt": "2024-01-15T11:00:02.000Z",
        "updatedAt": "2024-01-15T11:00:02.000Z"
      },
      {
        "_id": "507f1f77bcf86cd799439043",
        "productId": "507f1f77bcf86cd799439012",
        "size": "L",
        "color": "Black",
        "sku": "CLA-L-507F20",
        "price": 599,
        "stock": 50,
        "availability": "InStock",
        "createdAt": "2024-01-15T11:00:03.000Z",
        "updatedAt": "2024-01-15T11:00:03.000Z"
      }
    ],
    "updated": [],
    "skipped": [
      {
        "productId": "507f1f77bcf86cd799439011",
        "size": "S",
        "reason": "Already exists"
      },
      {
        "productId": "507f1f77bcf86cd799439011",
        "size": "M",
        "reason": "Already exists"
      }
    ]
  }
}
```

---

### Example 4: Error - Missing Required Fields

#### Request
```http
POST /api/variants/bulk HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "productIds": [],
  "sizes": ["S", "M"]
}
```

#### Response (400 Bad Request)
```json
{
  "message": "productIds array is required"
}
```

---

### Example 5: Error - No Products Found

#### Request
```http
POST /api/variants/bulk HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "productIds": [
    "000000000000000000000000",
    "111111111111111111111111"
  ],
  "sizes": ["S", "M"]
}
```

#### Response (404 Not Found)
```json
{
  "message": "No products found"
}
```

---

### Example 6: Error - Unauthorized

#### Request
```http
GET /api/admin/products-grouped HTTP/1.1
Host: localhost:5000
```

#### Response (401 Unauthorized)
```json
{
  "message": "Not authorized, token required"
}
```

---

### Example 7: Error - Forbidden (Not Admin)

#### Request
```http
GET /api/admin/products-grouped HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response (403 Forbidden)
```json
{
  "message": "Access denied. Admin role required"
}
```

---

## JavaScript/Axios Examples

### Example 1: Fetch Grouped Products

```javascript
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';
const token = localStorage.getItem('token');

async function fetchGroupedProducts() {
  try {
    const response = await axios.get(`${API_BASE}/admin/products-grouped`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Grouped Products:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
}

// Usage
fetchGroupedProducts()
  .then(products => {
    products.forEach(product => {
      console.log(`${product.title} (${product.count} duplicates)`);
    });
  });
```

### Example 2: Create Bulk Variants

```javascript
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';
const token = localStorage.getItem('token');

async function createBulkVariants(productIds, sizes, color) {
  try {
    const response = await axios.post(
      `${API_BASE}/variants/bulk`,
      {
        productIds,
        sizes,
        color
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Success:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
}

// Usage
createBulkVariants(
  ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
  ['S', 'M', 'L', 'XL'],
  'Black'
)
  .then(result => {
    console.log(`Created: ${result.summary.created}`);
    console.log(`Skipped: ${result.summary.skipped}`);
  });
```

### Example 3: Complete Workflow

```javascript
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';
const token = localStorage.getItem('token');

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

async function completeWorkflow() {
  try {
    // Step 1: Fetch grouped products
    console.log('Fetching grouped products...');
    const { data: products } = await api.get('/admin/products-grouped');
    console.log(`Found ${products.length} unique products`);
    
    // Step 2: Find product with duplicates
    const productWithDuplicates = products.find(p => p.count > 1);
    
    if (!productWithDuplicates) {
      console.log('No duplicate products found');
      return;
    }
    
    console.log(`\nSelected: ${productWithDuplicates.title}`);
    console.log(`Duplicates: ${productWithDuplicates.count}`);
    console.log(`Product IDs: ${productWithDuplicates.productIds.join(', ')}`);
    
    // Step 3: Create variants
    console.log('\nCreating variants...');
    const { data: result } = await api.post('/variants/bulk', {
      productIds: productWithDuplicates.productIds,
      sizes: ['S', 'M', 'L', 'XL'],
      color: 'Black'
    });
    
    // Step 4: Display results
    console.log('\n✅ Success!');
    console.log(`Created: ${result.summary.created} variants`);
    console.log(`Skipped: ${result.summary.skipped} variants`);
    console.log(`Applied to: ${result.summary.totalProducts} products`);
    
    return result;
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    throw error;
  }
}

// Run workflow
completeWorkflow();
```

---

## cURL Examples

### Example 1: Get Grouped Products

```bash
curl -X GET http://localhost:5000/api/admin/products-grouped \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

### Example 2: Create Bulk Variants

```bash
curl -X POST http://localhost:5000/api/variants/bulk \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "productIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
    "sizes": ["S", "M", "L", "XL"],
    "color": "Black"
  }'
```

### Example 3: Pretty Print Response

```bash
curl -X GET http://localhost:5000/api/admin/products-grouped \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  | json_pp
```

---

## Postman Collection

### Collection Structure

```json
{
  "info": {
    "name": "Grouped Products API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Get Grouped Products",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          }
        ],
        "url": {
          "raw": "{{baseUrl}}/admin/products-grouped",
          "host": ["{{baseUrl}}"],
          "path": ["admin", "products-grouped"]
        }
      }
    },
    {
      "name": "Create Bulk Variants",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          },
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"productIds\": [\"507f1f77bcf86cd799439011\"],\n  \"sizes\": [\"S\", \"M\", \"L\"],\n  \"color\": \"Black\"\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/variants/bulk",
          "host": ["{{baseUrl}}"],
          "path": ["variants", "bulk"]
        }
      }
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:5000/api"
    },
    {
      "key": "token",
      "value": "YOUR_TOKEN_HERE"
    }
  ]
}
```

---

## Response Time Benchmarks

### Grouped Products Endpoint
- **Small dataset** (< 100 products): ~50-100ms
- **Medium dataset** (100-1000 products): ~100-300ms
- **Large dataset** (> 1000 products): ~300-500ms

### Bulk Variants Endpoint
- **Small batch** (2 products × 4 sizes): ~100-200ms
- **Medium batch** (10 products × 5 sizes): ~300-500ms
- **Large batch** (50 products × 6 sizes): ~1-2s

These examples provide a complete reference for testing and integrating the Grouped Products API.
