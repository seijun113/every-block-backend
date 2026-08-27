import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/users/:id/follow
// Header: Authorization: Bearer <access_token>
// Toggles the logged-in user following the account at :id. Returns the new
// state and that account's updated follower count.
export async function POST(request, { params }) {
  let auth;
  try {
    auth = await requireUser(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Unexpected error.");
  }

  if (params.id === auth.user.id) {
    return jsonError(400, "You can't follow yourself.");
  }

  const { data: targetProfile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", params.id)
    .single();
  if (profileError || !targetProfile) {
    return jsonError(404, "Account not found.");
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("follows")
    .select("id")
    .eq("follower_id", auth.user.id)
    .eq("following_id", params.id)
    .maybeSingle();
  if (existingError) {
    return jsonError(500, `Could not check follow status: ${existingError.message}`);
  }

  let following;
  if (existing) {
    const { error } = await supabaseAdmin.from("follows").delete().eq("id", existing.id);
    if (error) return jsonError(500, `Could not unfollow: ${error.message}`);
    following = false;
  } else {
    const { error } = await supabaseAdmin
      .from("follows")
      .insert({ follower_id: auth.user.id, following_id: params.id });
    if (error) return jsonError(500, `Could not follow: ${error.message}`);
    following = true;
  }

  const { count, error: countError } = await supabaseAdmin
    .from("follows")
    .select("id", { count: "exact", head: true })
    .eq("following_id", params.id);
  if (countError) return jsonError(500, `Could not load follower count: ${countError.message}`);

  return NextResponse.json({ following, followerCount: count || 0 });
}
