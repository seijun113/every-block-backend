import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { verifyShopifyPurchase } from "@/lib/shopify";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/shopify/verify-purchase
// Header: Authorization: Bearer <access_token>
// Body: { orderNumber }
// Confirms a paid order (matched by order number + the account's email)
// contains the Every Block Tee, then marks the account shopify_verified.
export async function POST(request) {
  let auth;
  try {
    auth = await requireUser(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Unexpected error.");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const { orderNumber } = body || {};
  if (!orderNumber) {
    return jsonError(400, "orderNumber is required (e.g. '1001' or '#1001').");
  }

  let result;
  try {
    result = await verifyShopifyPurchase({ orderNumber, email: auth.user.email });
  } catch (err) {
    return jsonError(502, `Could not verify purchase with Shopify: ${err.message}`);
  }

  if (!result.verified) {
    return NextResponse.json({ verified: false, reason: result.reason }, { status: 200 });
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ shopify_verified: true, shopify_order_id: result.orderId })
    .eq("id", auth.user.id);

  if (error) {
    return jsonError(500, `Verified with Shopify but failed to save: ${error.message}`);
  }

  return NextResponse.json({ verified: true });
}
