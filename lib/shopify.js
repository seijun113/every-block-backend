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

async function shopifyFetchRaw(path) {
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!token) throw new Error("Missing SHOPIFY_ADMIN_API_TOKEN environment variable.");

  const res = await fetch(shopifyAdminUrl(path), {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Shopify API error ${res.status}: ${body}`);
  }
  return res;
}

function parseNextPageInfo(linkHeader) {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const [urlPart, relPart] = part.split(";").map((s) => s.trim());
    if (relPart === 'rel="next"') {
      const match = urlPart.match(/[?&]page_info=([^&>]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
  }
  return null;
}

/**
 * Pages through every past order in the store and returns the ones that
 * are paid (or partially refunded) and contain the configured product.
 * Used by the one-time backfill endpoint so purchases made before the
 * orders/paid webhook existed still get auto-verified.
 *
 * @returns {Promise<Array<{ email: string, orderId: string, orderName: string|null }>>}
 */
export async function listPastVerifiedPurchases() {
  const productId = process.env.SHOPIFY_PRODUCT_ID;
  if (!productId) throw new Error("Missing SHOPIFY_PRODUCT_ID environment variable.");
  const numericProductId = String(productId);
  const paidStatuses = ["paid", "partially_refunded"];

  const results = [];
  let path = `orders.json?${new URLSearchParams({
    status: "any",
    limit: "250",
    fields: "id,name,email,contact_email,financial_status,line_items",
  }).toString()}`;
  let pageCount = 0;
  const MAX_PAGES = 50;

  while (path && pageCount < MAX_PAGES) {
    pageCount += 1;
    const res = await shopifyFetchRaw(path);
    const data = await res.json();
    const orders = data.orders || [];

    for (const order of orders) {
      if (!paidStatuses.includes(order.financial_status)) continue;
      const hasProduct = (order.line_items || []).some(
        (item) => String(item.product_id) === numericProductId
      );
      if (!hasProduct) continue;
      const email = (order.email || order.contact_email || "").toLowerCase().trim();
      if (!email) continue;
      results.push({ email, orderId: String(order.id), orderName: order.name || null });
    }

    const nextPageInfo = parseNextPageInfo(res.headers.get("link"));
    path = nextPageInfo
      ? `orders.json?${new URLSearchParams({ limit: "250", page_info: nextPageInfo }).toString()}`
      : null;
  }

  return results;
}

function normalizeZip(zip) {
  return String(zip || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Confirms that a paid Shopify order matching the given order number
 * contains the configured product (the Every Block Tee), AND that the
 * caller-supplied ZIP/postal code matches the order's shipping or billing
 * address. The order number alone is not a secret -- Shopify order
 * numbers are sequential and easy to guess -- so a second factor (the
 * ZIP code from checkout) is required to stop someone from claiming a
 * stranger's real order before the real buyer verifies it themselves.
 * This intentionally does NOT require the order's checkout email to
 * match the account's email, because many buyers check out through Shop
 * Pay (or a partner/family member's card) using a saved email that's
 * different from the one they sign up on the site with.
 * The caller is responsible for making sure one order can't be used to
 * verify more than one account.
 *
 * @param {{ orderNumber: string, zip: string }} params
 * @returns {Promise<{ verified: boolean, orderId?: string, orderEmail?: string|null, reason?: string }>}
 */
export async function verifyShopifyPurchase({ orderNumber, zip }) {
  const productId = process.env.SHOPIFY_PRODUCT_ID;
  if (!productId) throw new Error("Missing SHOPIFY_PRODUCT_ID environment variable.");

  const trimmed = String(orderNumber).trim();
  const name = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  const query = new URLSearchParams({
    name,
    status: "any",
    fields: "id,name,email,financial_status,line_items,shipping_address,billing_address",
  });

  const data = await shopifyFetch(`orders.json?${query.toString()}`);
  const orders = data.orders || [];
  const order = orders[0];

  if (!order) {
    return {
      verified: false,
      reason: "No order found with that order number.",
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

  const suppliedZip = normalizeZip(zip);
  const shippingZip = normalizeZip(order.shipping_address && order.shipping_address.zip);
  const billingZip = normalizeZip(order.billing_address && order.billing_address.zip);

  if (!suppliedZip || (suppliedZip !== shippingZip && suppliedZip !== billingZip)) {
    return {
      verified: false,
      reason: "Order found, but that ZIP code doesn't match the shipping or billing address on file.",
    };
  }

  return {
    verified: true,
    orderId: String(order.id),
    orderEmail: (order.email || "").toLowerCase().trim() || null,
  };
}
