import { NextResponse } from "next/server";
import { supabaseAnon } from "@/lib/supabaseAnon";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export function jsonError(status, message) {
  return NextResponse.json({ error: message }, { status });
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

  return { user: data.user, profile };
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

    return { user: data.user, profile: profile || null };
  } catch {
    return null;
  }
}
