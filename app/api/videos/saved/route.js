import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { countBy, serializeVideos } from "@/lib/videoSerializer";

// GET /api/videos/saved
// Header: Authorization: Bearer <access_token>
// Returns every approved story the logged-in user has saved (bookmarked),
// newest-saved first — powers the "Saved Stories" section on My Account.
export async function GET(request) {
  let auth;
  try {
    auth = await requireUser(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Unexpected error.");
  }

  const { data: saveRows, error: savesError } = await supabaseAdmin
    .from("saves")
    .select("video_id, created_at")
    .eq("profile_id", auth.user.id)
    .order("created_at", { ascending: false });
  if (savesError) {
    return jsonError(500, `Could not load saved stories: ${savesError.message}`);
  }

  const videoIds = (saveRows || []).map((r) => r.video_id);
  if (!videoIds.length) {
    return NextResponse.json({ videos: [] });
  }

  const { data: videoRows, error: videosError } = await supabaseAdmin
    .from("videos")
    .select("id, profile_id, title, caption, location, country, author, cloudflare_uid, thumbnail_url, lat, lng, share_count, status, created_at")
    .in("id", videoIds)
    .eq("status", "approved");
  if (videosError) {
    return jsonError(500, `Could not load saved stories: ${videosError.message}`);
  }

  const [likesRes, likedRes] = await Promise.all([
    supabaseAdmin.from("likes").select("video_id").in("video_id", videoIds),
    supabaseAdmin.from("likes").select("video_id").eq("profile_id", auth.user.id).in("video_id", videoIds),
  ]);

  const enriched = serializeVideos(videoRows, {
    likeCounts: countBy(likesRes.data, "video_id"),
    likedSet: new Set((likedRes.data || []).map((r) => r.video_id)),
    savedSet: new Set(videoIds),
  });

  // Preserve "most recently saved first" order (the videos query above
  // doesn't guarantee it since it filters by an id list).
  const order = new Map(videoIds.map((id, i) => [id, i]));
  enriched.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return NextResponse.json({ videos: enriched });
}
