const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";

function shopifyAdminUrl(path) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) throw new Error("Missing SHOPIFY_STORE_DOMAIN environment variable.");
  return `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/${path}`;
}

async function shopifyFetch(path) {
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!token) throw new Error("Missing SHOPIFY_ADMIN_API_TOKEN environment variable.");

  const res = await fetch(shopifyAdminUrl(path), {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    // Never cache order-lookup responses.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Shopify API error ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Confirms that a paid Shopify order — matching the given order number and
 * the account's email — contains the configured product (the Every Block
 * Tee). On success, the caller is responsible for persisting the result.
 *
 * @param {{ orderNumber: string, email: string }} params
 * @returns {Promise<{ verified: boolean, orderId?: string, reason?: string }>}
 */
export async function verifyShopifyPurchase({ orderNumber, email }) {
  const productId = process.env.SHOPIFY_PRODUCT_ID;
  if (!productId) throw new Error("Missing SHOPIFY_PRODUCT_ID environment variable.");

  const name = String(orderNumber).startsWith("#") ? orderNumber : `#${orderNumber}`;
  const query = new URLSearchParams({
    name,
    status: "any",
    fields: "id,name,email,financial_status,line_items,customer",
  });

  const data = await shopifyFetch(`orders.json?${query.toString()}`);
  const orders = data.orders || [];

  const order = orders.find(
    (o) => (o.email || "").toLowerCase() === email.toLowerCase()
  );

  if (!order) {
    return {
      verified: false,
      reason: "No matching order found for that order number and account email.",
    };
  }

  const paidStatuses = ["paid", "partially_refunded"];
  if (!paidStatuses.includes(order.financial_status)) {
    return {
      verified: false,
      reason: `Order found but isn't marked as paid (status: ${order.financial_status}).`,
    };
  }

  const numericProductId = String(productId);
  const hasProduct = (order.line_items || []).some(
    (item) => String(item.product_id) === numericProductId
  );

  if (!hasProduct) {
    return {
      verified: false,
      reason: "Order found but does not include the Every Block Tee.",
    };
  }

  return { verified: true, orderId: String(order.id) };
}
