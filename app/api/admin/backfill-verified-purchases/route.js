import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listPastVerifiedPurchases } from "@/lib/shopify";

// POST /api/admin/backfill-verified-purchases
// Header: x-admin-key: <ADMIN_API_KEY>
//
// One-time (safe to re-run) catch-up for the automatic purchase-verification
// system: pages through every past Shopify order, finds the ones that are
// paid and contain the Every Block Tee, and records each buyer's email in
// verified_purchases -- then immediately verifies any existing account that
// matches. Only needed for orders placed BEFORE the orders/paid webhook was
// set up; going forward the webhook keeps this table current on its own.
export async function POST(request) {
  const adminKey = request.headers.get("x-admin-key");
  if (!process.env.ADMIN_API_KEY || adminKey !== process.env.ADMIN_API_KEY) {
    return jsonError(401, "Missing or invalid x-admin-key header.");
  }

  let purchases;
  try {
    purchases = await listPastVerifiedPurchases();
  } catch (err) {
    return jsonError(502, `Could not read orders from Shopify: ${err.message}`);
  }

  let recorded = 0;
  let profilesVerified = 0;

  for (const purchase of purchases) {
    const { error: upsertError } = await supabaseAdmin
      .from("verified_purchases")
      .upsert(
        {
          email: purchase.email,
          shopify_order_id: purchase.orderId,
          shopify_order_name: purchase.orderName,
        },
        { onConflict: "email" }
      );
    if (upsertError) continue;
    recorded += 1;

    const { data: updated, error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ shopify_verified: true, shopify_order_id: purchase.orderId })
      .ilike("email", purchase.email)
      .eq("shopify_verified", false)
      .select("id");
    if (!profileError && updated) profilesVerified += updated.length;
  }

  return NextResponse.json({
    ordersScanned: purchases.length,
    purchasesRecorded: recorded,
    existingProfilesVerified: profilesVerified,
  });
}
