import { NextResponse } from "next/server";
import { getOptionalUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { countBy, serializeVideos } from "@/lib/videoSerializer";

// GET /api/users/:id
// Public — no auth required, but reads the Authorization header if present
// to include "isFollowing"/"isSelf". Returns a public profile: name, joined
// date, their approved stories, and follower/following counts. Deliberately
// leaves out email — that's private, this endpoint is for anyone to view.
export async function GET(request, { params }) {
  const viewer = await getOptionalUser(request);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, name, created_at")
    .eq("id", params.id)
    .single();
  if (profileError || !profile) {
    return jsonError(404, "Account not found.");
  }

  const [videosRes, followerCountRes, followingCountRes, isFollowingRes] = await Promise.all([
    supabaseAdmin
      .from("videos")
      .select("id, profile_id, title, caption, location, country, author, cloudflare_uid, thumbnail_url, lat, lng, share_count, created_at")
      .eq("profile_id", params.id)
      .eq("status", "approved")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("following_id", params.id),
    supabaseAdmin
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("follower_id", params.id),
    viewer
      ? supabaseAdmin
          .from("follows")
          .select("id")
          .eq("follower_id", viewer.user.id)
          .eq("following_id", params.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const videos = videosRes.data || [];
  const videoIds = videos.map((v) => v.id);
  const { data: likeRows } = videoIds.length
    ? await supabaseAdmin.from("likes").select("video_id").in("video_id", videoIds)
    : { data: [] };
  const { data: likedRows } = viewer && videoIds.length
    ? await supabaseAdmin.from("likes").select("video_id").eq("profile_id", viewer.user.id).in("video_id", videoIds)
    : { data: [] };
  const { data: savedRows } = viewer && videoIds.length
    ? await supabaseAdmin.from("saves").select("video_id").eq("profile_id", viewer.user.id).in("video_id", videoIds)
    : { data: [] };

  const enrichedVideos = serializeVideos(videos, {
    likeCounts: countBy(likeRows, "video_id"),
    likedSet: new Set((likedRows || []).map((r) => r.video_id)),
    savedSet: new Set((savedRows || []).map((r) => r.video_id)),
  });

  return NextResponse.json({
    profile: {
      id: profile.id,
      name: profile.name,
      created_at: profile.created_at,
    },
    videos: enrichedVideos,
    followerCount: followerCountRes.count || 0,
    followingCount: followingCountRes.count || 0,
    isFollowing: !!isFollowingRes.data,
    isSelf: !!viewer && viewer.user.id === params.id,
  });
}
