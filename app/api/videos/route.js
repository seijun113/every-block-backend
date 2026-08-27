import { NextResponse } from "next/server";
import { requireUser, getOptionalUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { geocodeLocation } from "@/lib/geocode";
import { getClientIp } from "@/lib/getClientIp";
import { countBy, serializeVideos } from "@/lib/videoSerializer";

// GET /api/videos
// Public — no auth required, but reads the Authorization header if present
// so a logged-in viewer sees accurate "liked"/"saved" flags on each story.
// Returns only approved videos, newest first.
export async function GET(request) {
  const optionalAuth = await getOptionalUser(request);

  const { data, error } = await supabaseAdmin
    .from("videos")
    .select("id, profile_id, title, caption, location, country, author, cloudflare_uid, thumbnail_url, lat, lng, share_count, created_at")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    return jsonError(500, `Could not load videos: ${error.message}`);
  }

  const videos = data || [];
  const videoIds = videos.map((v) => v.id);

  const [likesRes, likedRes, savedRes] = await Promise.all([
    videoIds.length
      ? supabaseAdmin.from("likes").select("video_id").in("video_id", videoIds)
      : { data: [] },
    optionalAuth && videoIds.length
      ? supabaseAdmin.from("likes").select("video_id").eq("profile_id", optionalAuth.user.id).in("video_id", videoIds)
      : { data: [] },
    optionalAuth && videoIds.length
      ? supabaseAdmin.from("saves").select("video_id").eq("profile_id", optionalAuth.user.id).in("video_id", videoIds)
      : { data: [] },
  ]);

  const enriched = serializeVideos(videos, {
    likeCounts: countBy(likesRes.data, "video_id"),
    likedSet: new Set((likedRes.data || []).map((r) => r.video_id)),
    savedSet: new Set((savedRes.data || []).map((r) => r.video_id)),
  });

  return NextResponse.json({ videos: enriched });
}

// POST /api/videos
// Header: Authorization: Bearer <access_token>
// Body: { cloudflareUid, title, caption?, location, country?, author? }
// Call this AFTER the browser has already uploaded the file straight to the
// uploadURL from /api/videos/upload-url. Saves as status "pending" — it
// won't show up in the public GET list until approved.
export async function POST(request) {
  let auth;
  try {
    auth = await requireUser(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Unexpected error.");
  }

  if (!auth.profile?.shopify_verified) {
    return jsonError(403, "Only verified shirt owners can post a video.");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const { cloudflareUid, title, caption, location, country, author, thumbnailUrl } = body || {};
  if (!cloudflareUid || !title || !location) {
    return jsonError(400, "cloudflareUid, title, and location are required.");
  }

  // Best-effort geocoding so this post gets a pin on the map automatically.
  // Never blocks the post itself — if it fails, lat/lng just stay null and
  // the story simply won't show a pin.
  const coords = await geocodeLocation(
    country ? `${location}, ${country}` : location
  );

  const { data, error } = await supabaseAdmin
    .from("videos")
    .insert({
      profile_id: auth.user.id,
      cloudflare_uid: cloudflareUid,
      title,
      caption: caption || null,
      location,
      country: country || null,
      author: author || "Anonymous",
      // Optional — a custom thumbnail URL from POST /api/videos/thumbnail-upload.
      // Leave unset to use the auto frame from 2 seconds into the video.
      thumbnail_url: thumbnailUrl || null,
      lat: coords ? coords.lat : null,
      lng: coords ? coords.lng : null,
      ip: getClientIp(request),
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return jsonError(500, `Could not save video: ${error.message}`);
  }

  return NextResponse.json(
    { video: data, message: "Saved. It will appear publicly once approved." },
    { status: 201 }
  );
}
