import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { playbackUrlsFor } from "@/lib/cloudflareStream";

// GET /api/videos/mine
// Header: Authorization: Bearer <access_token>
// Returns every video the logged-in user has posted, regardless of status
// (pending/approved/rejected) — used by the My Account page so someone can
// see what's still under review, not just what's already public.
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
    .select("id, title, caption, location, country, author, cloudflare_uid, thumbnail_url, status, created_at")
    .eq("profile_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return jsonError(500, `Could not load your videos: ${error.message}`);
  }

  const videos = (data || []).map((v) => {
    const playback = playbackUrlsFor(v.cloudflare_uid);
    return {
      ...v,
      ...playback,
      thumbnailUrl: v.thumbnail_url || playback.thumbnailUrl,
    };
  });

  return NextResponse.json({ videos });
}
