import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/videos/:id/save
// Header: Authorization: Bearer <access_token>
// Toggles saving (bookmarking) this video for the logged-in user, so it
// shows up on their My Account -> Saved Stories list.
export async function POST(request, { params }) {
  let auth;
  try {
    auth = await requireUser(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Unexpected error.");
  }

  const { data: video, error: videoError } = await supabaseAdmin
    .from("videos")
    .select("id")
    .eq("id", params.id)
    .single();
  if (videoError || !video) {
    return jsonError(404, "Story not found.");
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("saves")
    .select("id")
    .eq("video_id", params.id)
    .eq("profile_id", auth.user.id)
    .maybeSingle();
  if (existingError) {
    return jsonError(500, `Could not check save status: ${existingError.message}`);
  }

  let saved;
  if (existing) {
    const { error } = await supabaseAdmin.from("saves").delete().eq("id", existing.id);
    if (error) return jsonError(500, `Could not unsave: ${error.message}`);
    saved = false;
  } else {
    const { error } = await supabaseAdmin
      .from("saves")
      .insert({ video_id: params.id, profile_id: auth.user.id });
    if (error) return jsonError(500, `Could not save: ${error.message}`);
    saved = true;
  }

  return NextResponse.json({ saved });
}
