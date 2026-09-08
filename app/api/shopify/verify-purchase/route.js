import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { verifyShopifyPurchase } from "@/lib/shopify";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/shopify/verify-purchase
// Header: Authorization: Bearer <access_token>
// Body: { orderNumber }
//
// Confirms a paid order (matched by order number ALONE) contains the
// Every Block Tee, then marks the signed-in account shopify_verified.
// Intentionally does not require the order's checkout email to match the
// account's email -- many buyers check out through Shop Pay using a saved
// email that differs from what they signed up with, and previously that
// mismatch silently blocked verification for real customers. To stop the
// same order being used to verify more than one account, we check that no
// other profile already claims this order id before saving.
//
// NOTE: an earlier version of this route had a hardcoded master bypass
// code that skipped the Shopify check entirely. That has been removed --
// every verification now requires a real, paid, matching order.
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
    result = await verifyShopifyPurchase({ orderNumber });
  } catch (err) {
    return jsonError(502, `Could not verify purchase with Shopify: ${err.message}`);
  }

  if (!result.verified) {
    return NextResponse.json({ verified: false, reason: result.reason }, { status: 200 });
  }

  // Prevent the same order from verifying more than one account.
  const { data: existingClaim, error: claimLookupError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("shopify_order_id", result.orderId)
    .neq("id", auth.user.id)
    .maybeSingle();

  if (claimLookupError) {
    return jsonError(500, `Could not check order usage: ${claimLookupError.message}`);
  }
  if (existingClaim) {
    return NextResponse.json(
      { verified: false, reason: "This order has already been used to verify a different account." },
      { status: 200 }
    );
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ shopify_verified: true, shopify_order_id: result.orderId })
    .eq("id", auth.user.id);

  if (error) {
    return jsonError(500, `Verified with Shopify but failed to save: ${error.message}`);
  }

  // Keep verified_purchases in sync using the order's own checkout email,
  // so a future signup from that email auto-verifies too.
  if (result.orderEmail) {
    await supabaseAdmin
      .from("verified_purchases")
      .upsert(
        { email: result.orderEmail, shopify_order_id: result.orderId, shopify_order_name: null },
        { onConflict: "email" }
      );
  }

  return NextResponse.json({ verified: true });
}
