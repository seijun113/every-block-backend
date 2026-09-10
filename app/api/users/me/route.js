import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

// PATCH /api/users/me
// Header: Authorization: Bearer <access_token>
// Body: { name }
// Lets a signed-in user change their own display name, at most once every
// 7 days. Requires a "name_updated_at" timestamptz column on "profiles"
// (see migration note in the repo README / commit message).
export async function PATCH(request) {
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

  const name = String(body?.name || "").trim();
  if (!name) {
    return jsonError(400, "Name is required.");
  }
  if (name.length > 40) {
    return jsonError(400, "Name must be 40 characters or fewer.");
  }

  const lastChanged = auth.profile?.name_updated_at
    ? new Date(auth.profile.name_updated_at).getTime()
    : null;

  if (lastChanged) {
    const nextAllowed = lastChanged + CHANGE_COOLDOWN_MS;
    if (Date.now() < nextAllowed) {
      return jsonError(
        429,
        `You can change your username again on ${new Date(nextAllowed).toLocaleDateString()}.`
      );
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ name, name_updated_at: now })
    .eq("id", auth.user.id)
    .select()
    .single();

  if (error) {
    return jsonError(500, `Could not update name: ${error.message}`);
  }

  return NextResponse.json({ profile: data });
}
