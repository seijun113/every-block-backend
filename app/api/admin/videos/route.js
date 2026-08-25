import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { playbackUrlsFor } from "@/lib/cloudflareStream";

// GET /api/admin/videos?status=pending|approved|rejected|all
// Header: x-admin-key: <ADMIN_API_KEY>
// Lists videos for manual review. Unlike GET /api/videos (public,
// approved-only), this returns whichever status you ask for — gated by the
// shared admin secret rather than a user login, since this is for you
// (the site owner), not a specific account.
export async function GET(request) {
  const adminKey = request.headers.get("x-admin-key");
  if (!process.env.ADMIN_API_KEY || adminKey !== process.env.ADMIN_API_KEY) {
    return jsonError(401, "Missing or invalid x-admin-key header.");
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "pending";

  let query = supabaseAdmin
    .from("videos")
    .select("id, title, caption, location, country, author, cloudflare_uid, thumbnail_url, status, created_at")
    .order("created_at", { ascending: false });

  if (status !== "all") {
    if (!["pending", "approved", "rejected"].includes(status)) {
      return jsonError(400, "status must be 'pending', 'approved', 'rejected', or 'all'.");
    }
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return jsonError(500, `Could not load videos: ${error.message}`);
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
