import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/videos/:id/like
// Header: Authorization: Bearer <access_token>
// Toggles a like from the logged-in user on this video (no purchase
// verification needed — liking is open to any account). Returns the new
// state and the video's total like count.
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
    .from("likes")
    .select("id")
    .eq("video_id", params.id)
    .eq("profile_id", auth.user.id)
    .maybeSingle();
  if (existingError) {
    return jsonError(500, `Could not check like status: ${existingError.message}`);
  }

  let liked;
  if (existing) {
    const { error } = await supabaseAdmin.from("likes").delete().eq("id", existing.id);
    if (error) return jsonError(500, `Could not unlike: ${error.message}`);
    liked = false;
  } else {
    const { error } = await supabaseAdmin
      .from("likes")
      .insert({ video_id: params.id, profile_id: auth.user.id });
    if (error) return jsonError(500, `Could not like: ${error.message}`);
    liked = true;
  }

  const { count, error: countError } = await supabaseAdmin
    .from("likes")
    .select("id", { count: "exact", head: true })
    .eq("video_id", params.id);
  if (countError) return jsonError(500, `Could not load like count: ${countError.message}`);

  return NextResponse.json({ liked, likeCount: count || 0 });
}
