import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { playbackUrlsFor } from "@/lib/cloudflareStream";
import { geocodeLocation } from "@/lib/geocode";
import { getClientIp } from "@/lib/getClientIp";

// GET /api/videos
// Public — no auth required. Returns only approved videos, newest first,
// with ready-to-use playback URLs and (when available) lat/lng for the map.
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("videos")
    .select("id, title, caption, location, country, author, cloudflare_uid, thumbnail_url, lat, lng, created_at")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    return jsonError(500, `Could not load videos: ${error.message}`);
  }

  const videos = (data || []).map((v) => {
    const playback = playbackUrlsFor(v.cloudflare_uid);
    return {
      ...v,
      ...playback,
      // A custom uploaded thumbnail wins; otherwise fall back to the
      // auto-generated frame from 2 seconds into the video.
      thumbnailUrl: v.thumbnail_url || playback.thumbnailUrl,
    };
  });

  return NextResponse.json({ videos });
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
