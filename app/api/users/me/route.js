import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

// Usernames: letters, numbers, and underscores only. No spaces or other
// special characters.
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

// Basic inappropriate-word blocklist. Matched as a substring against the
// lowercased username so variants (e.g. trailing numbers) are still caught.
const BLOCKED_WORDS = [
  "fuck", "shit", "bitch", "asshole", "cunt", "nigger", "nigga", "faggot",
  "fag", "retard", "rape", "rapist", "pedo", "nazi", "slut", "whore",
  "dick", "pussy", "cock", "kike", "chink", "spic", "tranny", "bastard",
  "cum", "porn", "sex",
];

function containsBlockedWord(name) {
  const lower = name.toLowerCase();
  return BLOCKED_WORDS.some((word) => lower.includes(word));
}

// PATCH /api/users/me
// Header: Authorization: Bearer <access_token>
// Body: { name }
// Lets a signed-in user change their own username, at most once every
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
    return jsonError(400, "Username is required.");
  }
  if (name.length < 3) {
    return jsonError(400, "Username must be at least 3 characters.");
  }
  if (name.length > 20) {
    return jsonError(400, "Username must be 20 characters or fewer.");
  }
  if (!USERNAME_REGEX.test(name)) {
    return jsonError(
      400,
      "Username can only contain letters, numbers, and underscores — no spaces or special characters."
    );
  }
  if (containsBlockedWord(name)) {
    return jsonError(400, "That username isn't allowed. Please choose another.");
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

  // Case-insensitive uniqueness check against every other profile.
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("name", name)
    .neq("id", auth.user.id)
    .maybeSingle();

  if (existingError) {
    return jsonError(500, `Could not verify username availability: ${existingError.message}`);
  }
  if (existing) {
    return jsonError(409, "That username is already taken.");
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ name, name_updated_at: now })
    .eq("id", auth.user.id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return jsonError(409, "That username is already taken.");
    }
    return jsonError(500, `Could not update name: ${error.message}`);
  }

  return NextResponse.json({ profile: data });
}
