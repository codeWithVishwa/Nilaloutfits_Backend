export const PERMISSIONS = {
  CATALOG_READ: 'catalog:read',
  CATALOG_WRITE: 'catalog:write',
  BLOG_READ: 'blog:read',
  BLOG_WRITE: 'blog:write',
  ORDER_READ: 'order:read',
  ORDER_WRITE: 'order:write',
  PAYMENT_READ: 'payment:read',
  PAYMENT_WRITE: 'payment:write',
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  REVIEW_WRITE: 'review:write',
  REVIEW_MODERATE: 'review:moderate',
  WISHLIST: 'wishlist:use',
  CART: 'cart:use',
};

export const ROLE_PERMISSIONS = {
  customer: [
    PERMISSIONS.CATALOG_READ,
    PERMISSIONS.BLOG_READ,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_WRITE,
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.PAYMENT_WRITE,
    PERMISSIONS.REVIEW_WRITE,
    PERMISSIONS.WISHLIST,
    PERMISSIONS.CART,
  ],
  moderator: [
    PERMISSIONS.CATALOG_READ,
    PERMISSIONS.CATALOG_WRITE,
    PERMISSIONS.BLOG_READ,
    PERMISSIONS.BLOG_WRITE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.REVIEW_MODERATE,
  ],
  admin: Object.values(PERMISSIONS),
};
