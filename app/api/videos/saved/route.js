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
}    .eq("status", "approved");
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
