
Base URL: `/api`

Auth header for protected routes:

Authorization: `Bearer <accessToken>`

## Auth

### Register
POST `/auth/register`

Request:
{
  "name": "Aisha",
  "email": "aisha@example.com",
  "password": "Secret123"
}

Response:
{
  "message": "Registered successfully. Please verify your email.",
  "user": {
    "id": "...",
    "name": "Aisha",
    "email": "aisha@example.com",
    "role": "customer",
    "isEmailVerified": false
  }
}

### Verify Email
POST `/auth/verify-email`

Request:
{ "token": "<email-token>" }

Response:
{ "message": "Email verified successfully", "accessToken": "..." }

### Login
POST `/auth/login`

Request:
{ "email": "aisha@example.com", "password": "Secret123" }

Response:
{ "message": "Logged in", "accessToken": "..." }

### Refresh
POST `/auth/refresh`

Response:
{ "accessToken": "..." }

## Catalog

### Create Product
POST `/products`

Request:
{
  "title": "Linen Shirt",
  "description": "Lightweight linen",
  "categoryId": "...",
  "subcategoryId": "...",
  "brand": "Nilal",
  "images": ["https://..."],
  "tags": ["linen", "summer"]
}

Response:
{ "_id": "...", "title": "Linen Shirt" }

### Create Variant
POST `/variants`

Request:
{
  "productId": "...",
  "size": "M",
  "color": "Blue",
  "sku": "NSHIRT-BLU-M",
  "price": 1499,
  "stock": 20
}

Response:
{ "_id": "...", "availability": "InStock" }

## Cart

### Add to Cart
POST `/cart`

Request:
{
  "productId": "...",
  "variantId": "...",
  "quantity": 2
}

Response:
{ "userId": "...", "items": [ ... ] }

## Orders

### Create Order
POST `/orders`

Request:
{
  "items": [
    { "variantId": "...", "quantity": 1 }
  ],
  "address": { "name": "Aisha", "line1": "123 Main St", "city": "Mumbai" },
  "shippingFee": 49,
  "tax": 0
}

Response:
{ "_id": "...", "status": "Created", "total": 1548 }

## Payments

### Create Razorpay Order
POST `/payments/razorpay/order`

Request:
{ "orderId": "..." }

Response:
{ "id": "order_...", "amount": 154800, "currency": "INR" }
