import { NextResponse } from "next/server";
import { supabaseAnon } from "@/lib/supabaseAnon";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export function jsonError(status, message) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * If a profile isn't verified yet, but the account's email is CONFIRMED
 * (proven ownership — either they clicked the email confirmation link, or
 * they signed in with Google, which pre-verifies email) and that email
 * matches a real Shopify order in verified_purchases, grant verification.
 *
 * This runs on every authenticated request (via requireUser/getOptionalUser)
 * rather than only at signup, so it also catches someone who confirms their
 * email later. Gating on email_confirmed_at is what stops someone from
 * typing in a stranger's email at signup and instantly inheriting that
 * stranger's verified-purchase status — they'd need to actually control
 * that inbox to confirm it.
 */
async function syncShopifyVerification(user, profile) {
  if (!profile || profile.shopify_verified) return profile;
  if (!user.email_confirmed_at) return profile;

  const { data: purchase } = await supabaseAdmin
    .from("verified_purchases")
    .select("shopify_order_id")
    .ilike("email", user.email)
    .maybeSingle();
  if (!purchase) return profile;

  const { data: updated } = await supabaseAdmin
    .from("profiles")
    .update({ shopify_verified: true, shopify_order_id: purchase.shopify_order_id })
    .eq("id", user.id)
    .select()
    .single();

  return updated || { ...profile, shopify_verified: true, shopify_order_id: purchase.shopify_order_id };
}

/**
 * Reads "Authorization: Bearer <access_token>" from a Request, validates it
 * against Supabase, and returns { user, profile }.
 *
 * On failure, THROWS a NextResponse (401/500) rather than returning one —
 * catch it in the route handler and return it directly:
 *
 *   try {
 *     const { user, profile } = await requireUser(request);
 *   } catch (err) {
 *     if (err instanceof Response) return err;
 *     return jsonError(500, "Unexpected error.");
 *   }
 */
export async function requireUser(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    throw jsonError(
      401,
      "Missing Authorization header. Send 'Authorization: Bearer <access_token>'."
    );
  }

  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data?.user) {
    throw jsonError(401, "Invalid or expired session. Please log in again.");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();

  if (profileError) {
    throw jsonError(500, `Could not load user profile: ${profileError.message}`);
  }

  const syncedProfile = await syncShopifyVerification(data.user, profile);

  return { user: data.user, profile: syncedProfile };
}

/**
 * Like requireUser(), but never throws — returns { user, profile } if a
 * valid Bearer token was sent, or null otherwise (no token, expired token,
 * whatever). For routes that work either way (e.g. the public video list)
 * but personalize the response — "liked"/"saved" flags — when someone
 * happens to be logged in.
 */
export async function getOptionalUser(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) return null;

  try {
    const { data, error } = await supabaseAnon.auth.getUser(token);
    if (error || !data?.user) return null;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    const syncedProfile = await syncShopifyVerification(data.user, profile);

    return { user: data.user, profile: syncedProfile || null };
  } catch {
    return null;
  }
}
