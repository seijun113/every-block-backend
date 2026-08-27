import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { countBy, serializeVideos } from "@/lib/videoSerializer";

// GET /api/videos/mine
// Header: Authorization: Bearer <access_token>
// Returns every video the logged-in user has posted, regardless of status
// (pending/approved/rejected) — used by the My Account page so someone can
// see what's still under review, not just what's already public. Includes
// like/share counts so people can see how their own posts are doing.
export async function GET(request) {
  let auth;
  try {
    auth = await requireUser(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Unexpected error.");
  }

  const { data, error } = await supabaseAdmin
    .from("videos")
    .select("id, profile_id, title, caption, location, country, author, cloudflare_uid, thumbnail_url, share_count, status, created_at")
    .eq("profile_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return jsonError(500, `Could not load your videos: ${error.message}`);
  }

  const videos = data || [];
  const videoIds = videos.map((v) => v.id);
  const { data: likeRows } = videoIds.length
    ? await supabaseAdmin.from("likes").select("video_id").in("video_id", videoIds)
    : { data: [] };

  const enriched = serializeVideos(videos, { likeCounts: countBy(likeRows, "video_id") });

  return NextResponse.json({ videos: enriched });
}
