import Order from "../models/Order.js";
import { sendEmail } from "./email.js";

const getBaseUrl = () => {
  return (
    process.env.SERVER_URL ||
    process.env.API_URL ||
    process.env.BACKEND_URL ||
    "http://localhost:3000"
  );
};

const resolveImageUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const normalized = url.startsWith("/") ? url : `/${url}`;
  return `${getBaseUrl()}${normalized}`;
};

const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`;

export const sendOrderInvoiceEmail = async (orderId) => {
  const order = await Order.findById(orderId)
    .populate("userId", "name email phone")
    .populate("items.productId", "title images brand")
    .populate("items.variantId", "size color sku price");

  if (!order || !order.userId?.email) return;

  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const itemsHtml = order.items
    .map((item) => {
      const product = item.productId || {};
      const variant = item.variantId || {};
      const image = Array.isArray(product.images)
        ? product.images[0]
        : product.images;
      const imageUrl = resolveImageUrl(image);
      const title = product.title || "Product";
      const size = variant.size ? `Size: ${variant.size}` : "";
      const color = variant.color ? `Color: ${variant.color}` : "";
      const sku = variant.sku ? `SKU: ${variant.sku}` : "";
      const meta = [size, color, sku].filter(Boolean).join(" • ");

      return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #ececec;">
          <div style="display:flex;gap:12px;align-items:center;">
            ${imageUrl ? `<img src="${imageUrl}" alt="${title}" width="64" height="64" style="object-fit:cover;border-radius:10px;border:1px solid #eee;" />` : ""}
            <div>
              <div style="font-weight:600;color:#111;">${title}</div>
              ${meta ? `<div style="font-size:12px;color:#777;">${meta}</div>` : ""}
            </div>
          </div>
        </td>
        <td style="text-align:center;border-bottom:1px solid #ececec;">${item.quantity}</td>
        <td style="text-align:right;border-bottom:1px solid #ececec;">${formatCurrency(item.priceSnapshot)}</td>
      </tr>
    `;
    })
    .join("");

  const address = order.address || {};
  const addressLines = [
    address.name,
    address.line1,
    address.line2,
    `${address.city || ""} ${address.state || ""}`.trim(),
    address.postalCode,
    address.country,
    address.phone || address.phoneNumber,
  ].filter(Boolean);

  const html = `
    <div style="margin:0;padding:0;background:#f2f6ff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:20px;">

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:#ffffff;border-radius:18px;padding:24px;border:1px solid #e6ecff;box-shadow:0 10px 30px rgba(0,0,0,.06);">

          <!-- Header -->
          <div style="text-align:center;">
            <h2 style="margin:0;color:#2563eb;">Nilal Outfits</h2>
            <p style="margin:6px 0 0;color:#64748b;font-size:14px;">Order Confirmation</p>
          </div>

          <!-- Greeting -->
          <div style="margin-top:20px;font-size:14px;color:#0f172a;">
            Hi ${order.userId.name || "there"},<br/>
            <span style="color:#475569;">Your order has been placed successfully.</span>
          </div>

          <!-- Summary Boxes -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
            <tr>
              <td width="50%" style="padding:6px;">
                <div style="background:#f5f8ff;padding:12px;border-radius:12px;">
                  <div style="font-size:11px;color:#64748b;">Order ID</div>
                  <div style="font-weight:600;font-size:12px;word-break:break-all;">#${order._id}</div>
                </div>
              </td>

              <td width="50%" style="padding:6px;">
                <div style="background:#f5f8ff;padding:12px;border-radius:12px;">
                  <div style="font-size:11px;color:#64748b;">Payment</div>
                  <div style="font-weight:600;">${order.paymentMethod || "Razorpay"}</div>
                </div>
              </td>
            </tr>

            <tr>
              <td width="50%" style="padding:6px;">
                <div style="background:#f5f8ff;padding:12px;border-radius:12px;">
                  <div style="font-size:11px;color:#64748b;">Items</div>
                  <div style="font-weight:600;">${totalItems}</div>
                </div>
              </td>

              <td width="50%" style="padding:6px;">
                <div style="background:#f5f8ff;padding:12px;border-radius:12px;">
                  <div style="font-size:11px;color:#64748b;">Total</div>
                  <div style="font-weight:700;color:#2563eb;">${formatCurrency(order.total)}</div>
                </div>
              </td>
            </tr>
          </table>

          <!-- Products -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;font-size:13px;">
            <thead>
              <tr>
                <th align="left" style="border-bottom:1px solid #e5edff;padding-bottom:6px;">Product</th>
                <th align="center" style="border-bottom:1px solid #e5edff;padding-bottom:6px;">Qty</th>
                <th align="right" style="border-bottom:1px solid #e5edff;padding-bottom:6px;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <!-- Totals -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;font-size:14px;border-top:1px dashed #dbe4ff;padding-top:10px;">
            <tr>
              <td>Subtotal</td>
              <td align="right">${formatCurrency(order.subtotal)}</td>
            </tr>
            <tr>
              <td>Shipping</td>
              <td align="right">${formatCurrency(order.shippingFee)}</td>
            </tr>
            <tr>
              <td>Tax</td>
              <td align="right">${formatCurrency(order.tax)}</td>
            </tr>
            <tr>
              <td style="font-weight:700;padding-top:8px;">Total</td>
              <td align="right" style="font-weight:700;color:#2563eb;padding-top:8px;">
                ${formatCurrency(order.total)}
              </td>
            </tr>
          </table>

          <!-- Address -->
          ${
            addressLines.length
              ? `
          <div style="margin-top:18px;background:#f5f8ff;padding:12px;border-radius:12px;">
            <div style="font-size:12px;color:#64748b;">Shipping Address</div>
            <div style="font-size:13px;margin-top:4px;color:#0f172a;">
              ${addressLines.join("<br/>")}
            </div>
          </div>
          `
              : ""
          }

          <!-- CTA -->
          <div style="text-align:center;margin-top:22px;">
            <a href="https://nilaloutfits.com/account" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600;display:inline-block;">
              View Order
            </a>
          </div>

          <!-- Footer -->
          <p style="margin-top:20px;font-size:12px;color:#64748b;text-align:center;">
            Need help? Just reply to this email.
          </p>

        </td>
      </tr>
    </table>

  </div>
</div>
  `;

  const text = `Order #${order._id}\nTotal Items: ${totalItems}\nTotal: ${formatCurrency(order.total)}`;

  await sendEmail({
    to: order.userId.email,
    subject: `Order confirmed #${order._id}`,
    html,
    text,
  });
};
