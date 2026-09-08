import { NextResponse } from "next/server";
import { supabaseAnon } from "@/lib/supabaseAnon";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonError } from "@/lib/auth";

// POST /api/auth/ensure-profile
// Header: Authorization: Bearer <access_token>
//
// Makes sure the signed-in Supabase auth user has a matching row in
// `profiles`. Our own email/password signup (/api/auth/signup) creates
// this row itself, but a user who signs in via an OAuth provider (Google,
// etc.) never goes through that route -- Supabase creates the auth user
// directly from the browser. Call this once right after any OAuth
// sign-in completes so first-time Google users get a profile the rest of
// the app can read from, same as everyone else.
//
// Safe to call every time someone signs in: if the profile already
// exists this is a no-op that just returns it.
export async function POST(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return jsonError(401, "Missing Authorization header. Send 'Authorization: Bearer <access_token>'.");
  }

  const { data: authData, error: authError } = await supabaseAnon.auth.getUser(token);
  if (authError || !authData?.user) {
    return jsonError(401, "Invalid or expired session. Please log in again.");
  }
  const user = authData.user;
  const email = (user.email || "").toLowerCase().trim();

  const { data: existingProfile, error: lookupError } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (lookupError) {
    return jsonError(500, `Could not look up profile: ${lookupError.message}`);
  }

  if (existingProfile) {
    return NextResponse.json({ profile: existingProfile, created: false });
  }

  // Same auto-verify check as the regular signup route: if this email
  // already shows up in verified_purchases (recorded by the Shopify
  // webhook or backfill, possibly before this account ever existed),
  // mark the new profile shopify_verified immediately.
  let shopifyVerified = false;
  let shopifyOrderId = null;
  if (email) {
    const { data: purchase } = await supabaseAdmin
      .from("verified_purchases")
      .select("shopify_order_id")
      .ilike("email", email)
      .maybeSingle();
    if (purchase) {
      shopifyVerified = true;
      shopifyOrderId = purchase.shopify_order_id;
    }
  }

  const metadata = user.user_metadata || {};
  const name = metadata.full_name || metadata.name || null;

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("profiles")
    .insert({
      id: user.id,
      email,
      name,
      shopify_verified: shopifyVerified,
      shopify_order_id: shopifyOrderId,
    })
    .select("*")
    .single();

  // 23505 = unique_violation -- someone else's concurrent request (or a
  // retry) already created this row. Just fetch and return it.
  if (insertError && insertError.code === "23505") {
    const { data: raceProfile, error: raceError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (raceError || !raceProfile) {
      return jsonError(500, `Profile insert conflicted and re-fetch failed: ${raceError?.message || "not found"}`);
    }
    return NextResponse.json({ profile: raceProfile, created: false });
  }

  if (insertError) {
    return jsonError(500, `Could not create profile: ${insertError.message}`);
  }

  return NextResponse.json({ profile: inserted, created: true });
}
