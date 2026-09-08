import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/admin/check-verification?email=someone@example.com
// Header: x-admin-key: <ADMIN_API_KEY>
//
// Read-only diagnostic: shows exactly what the database knows about one
// email address -- whether a Shopify webhook has ever recorded a verified
// purchase for it, and whether there's an account and what its
// shopify_verified/shopify_order_id fields currently say. Use this to
// figure out where an "I bought it but it still says unverified" report
// is actually breaking down.
export async function GET(request) {
  const adminKey = request.headers.get("x-admin-key");
  if (!process.env.ADMIN_API_KEY || adminKey !== process.env.ADMIN_API_KEY) {
    return jsonError(401, "Missing or invalid x-admin-key header.");
  }

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") || "").trim();
  if (!email) {
    return jsonError(400, "email query parameter is required.");
  }

  const { data: purchase, error: purchaseError } = await supabaseAdmin
    .from("verified_purchases")
    .select("*")
    .ilike("email", email)
    .maybeSingle();

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, shopify_verified, shopify_order_id, created_at")
    .ilike("email", email);

  return NextResponse.json({
    email,
    verifiedPurchase: purchase || null,
    verifiedPurchaseLookupError: purchaseError ? purchaseError.message : null,
    matchingProfiles: profiles || [],
    profileLookupError: profileError ? profileError.message : null,
    envCheck: {
      hasWebhookSecret: Boolean(process.env.SHOPIFY_WEBHOOK_SECRET),
      hasProductId: Boolean(process.env.SHOPIFY_PRODUCT_ID),
      productId: process.env.SHOPIFY_PRODUCT_ID || null,
    },
  });
}
