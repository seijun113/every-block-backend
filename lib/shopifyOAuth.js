import crypto from "crypto";

const SCOPES = "read_orders";

/**
 * Builds the Shopify OAuth authorize URL for this app. Visiting it (as a
 * logged-in store owner/staff with permission) starts the standard OAuth
 * install/re-authorize flow.
 */
export function buildInstallUrl({ shop, redirectUri, state }) {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!clientId) throw new Error("Missing SHOPIFY_CLIENT_ID environment variable.");
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Verifies the `hmac` query parameter Shopify attaches to every OAuth
 * redirect, per Shopify's documented verification algorithm: everything
 * except hmac/signature, sorted by key, joined as key=value pairs with
 * "&", HMAC-SHA256'd with the app's client secret, hex-encoded.
 */
export function verifyOAuthHmac(searchParams) {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) throw new Error("Missing SHOPIFY_CLIENT_SECRET environment variable.");

  const hmac = searchParams.get("hmac");
  if (!hmac) return false;

  const pairs = [];
  for (const [key, value] of searchParams.entries()) {
    if (key === "hmac" || key === "signature") continue;
    pairs.push([key, value]);
  }
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const message = pairs.map(([k, v]) => `${k}=${v}`).join("&");

  const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");

  const expected = Buffer.from(digest, "utf8");
  const received = Buffer.from(hmac, "utf8");
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

/**
 * Exchanges a one-time OAuth `code` for a permanent Admin API access
 * token. For a single-merchant (custom-distribution) app like this one,
 * the resulting token does not expire -- it's the direct equivalent of the
 * old "reveal token once" static token, just obtained through the standard
 * OAuth endpoint instead of a UI button.
 */
export async function exchangeCodeForToken({ shop, code }) {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET environment variable.");
  }

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Shopify token exchange failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.access_token;
}
