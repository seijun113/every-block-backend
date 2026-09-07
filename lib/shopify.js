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
