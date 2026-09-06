import crypto from "crypto";

// Verifies that a webhook request really came from Shopify by recomputing
// the HMAC over the *raw* request body and comparing it (in constant time)
// against the value Shopify sent in the X-Shopify-Hmac-Sha256 header.
//
// IMPORTANT: this must run on the raw text body, before any JSON.parse --
// re-serializing the parsed JSON will not byte-for-byte match what Shopify
// signed, and the signature will never verify.
export function verifyShopifyWebhook({ rawBody, hmacHeader }) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing SHOPIFY_WEBHOOK_SECRET environment variable.");
  if (!hmacHeader) return false;

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  const expected = Buffer.from(digest, "utf8");
  const received = Buffer.from(hmacHeader, "utf8");

  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}
