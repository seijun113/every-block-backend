import { NextResponse } from "next/server";
import { verifyShopifyWebhook } from "@/lib/verifyShopifyWebhook";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/shopify/webhook
// Configure this URL in Shopify Admin -> Settings -> Notifications ->
// Webhooks, subscribed to the "Order payment" (orders/paid) event, with
// the same secret you put in SHOPIFY_WEBHOOK_SECRET.
//
// Shopify calls this the instant an order is paid. If it is the Every Block
// Tee, we record the buyer's email as verified -- automatically, with no
// order number typed anywhere. See lib/verifyShopifyWebhook.js and
// app/api/auth/signup/route.js for the other half of this flow.
export async function POST(request) {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  let valid;
  try {
    valid = verifyShopifyWebhook({ rawBody, hmacHeader });
  } catch (err) {
    console.error("Shopify webhook config error:", err.message);
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }

  if (!valid) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let order;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const productId = process.env.SHOPIFY_PRODUCT_ID;
  const paidStatuses = ["paid", "partially_refunded"];
  const isPaid = paidStatuses.includes(order.financial_status);
  const hasProduct = (order.line_items || []).some(
    (item) => String(item.product_id) === String(productId)
  );

  // Always 200 back to Shopify once the signature checks out -- returning
  // an error here just makes Shopify retry a webhook we've already decided
  // not to act on (wrong product, unpaid, etc.).
  if (!isPaid || !hasProduct) {
    return NextResponse.json({ recorded: false });
  }

  const email = (order.email || order.contact_email || "").toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ recorded: false, reason: "Order has no email." });
  }

  const { error: upsertError } = await supabaseAdmin
    .from("verified_purchases")
    .upsert(
      {
        email,
        shopify_order_id: String(order.id),
        shopify_order_name: order.name || null,
      },
      { onConflict: "email" }
    );

  if (upsertError) {
    console.error("Failed to record verified purchase:", upsertError.message);
    return NextResponse.json({ error: "Database error." }, { status: 500 });
  }

  // If an account with this email already exists (they signed up before
  // buying), verify it immediately instead of waiting for their next login.
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ shopify_verified: true, shopify_order_id: String(order.id) })
    .ilike("email", email)
    .eq("shopify_verified", false);

  if (profileError) {
    console.error("Failed to auto-verify existing profile:", profileError.message);
  }

  return NextResponse.json({ recorded: true });
}
