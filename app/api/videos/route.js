import { NextResponse } from "next/server";
import { requireUser, getOptionalUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { geocodeLocation } from "@/lib/geocode";
import { getClientIp } from "@/lib/getClientIp";
import { countBy, serializeVideos } from "@/lib/videoSerializer";
import { playbackUrlsFor } from "@/lib/cloudflareStream";
import { reviewVideo } from "@/lib/aiReview";

const SELECT_COLUMNS =
  "id, profile_id, post_type, title, caption, body, photo_urls, location, country, author, cloudflare_uid, thumbnail_url, lat, lng, share_count, view_count, created_at";

// GET /api/videos
// Public — no auth required, but reads the Authorization header if present
// so a logged-in viewer sees accurate "liked"/"saved" flags on each story.
// Returns only approved videos, newest first. Includes both "video" posts
// (post_type "video", has cloudflare_uid) and "blog" posts (post_type
// "blog", has body text and optional photo_urls, no video at all).
export async function GET(request) {
  const optionalAuth = await getOptionalUser(request);

  const { data, error } = await supabaseAdmin
    .from("videos")
    .select(SELECT_COLUMNS)
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
//
// Two shapes, chosen by "postType":
//   Video story (default, postType omitted or "video"):
//     { cloudflareUid, title, caption?, location, country?, author?, thumbnailUrl? }
//     Call this AFTER the browser has already uploaded the file straight to
//     the uploadURL from /api/videos/upload-url.
//   Written/blog story (postType "blog"):
//     { postType: "blog", title, body, location, country?, author?, photoUrls? }
//     No video required — photoUrls (from POST /api/videos/thumbnail-upload,
//     called once per photo) is an optional array of attached photo URLs.
//
// Either way this saves as status "pending" — it won't show up in the
// public GET list until approved.
export async function POST(request) {
  let auth;
  try {
    auth = await requireUser(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Unexpected error.");
  }

  if (!auth.profile?.shopify_verified) {
    return jsonError(403, "Only verified shirt owners can post a story.");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const postType = body?.postType === "blog" ? "blog" : "video";
  const { title, caption, location, country, author } = body || {};

  if (!title || !location) {
    return jsonError(400, "title and location are required.");
  }

  let insertRow = {
    profile_id: auth.user.id,
    post_type: postType,
    title,
    caption: caption || null,
    location,
    country: country || null,
    author: author || "Anonymous",
    ip: getClientIp(request),
    status: "pending",
  };

  let reviewThumbnailUrl = null;
  let reviewBody = null;

  if (postType === "blog") {
    const text = (body.body || "").trim();
    if (!text) {
      return jsonError(400, "body is required for a written story.");
    }
    if (text.length > 20000) {
      return jsonError(400, "Body must be under 20,000 characters.");
    }
    const photoUrls = Array.isArray(body.photoUrls) ? body.photoUrls.filter((u) => typeof u === "string" && u).slice(0, 12) : [];
    insertRow.body = text;
    insertRow.photo_urls = photoUrls;
    reviewThumbnailUrl = photoUrls[0] || null;
    reviewBody = text;
  } else {
    const { cloudflareUid, thumbnailUrl } = body || {};
    if (!cloudflareUid) {
      return jsonError(400, "cloudflareUid is required for a video story.");
    }
    insertRow.cloudflare_uid = cloudflareUid;
    // Optional — a custom thumbnail URL from POST /api/videos/thumbnail-upload.
    // Leave unset to use the auto frame from 2 seconds into the video.
    insertRow.thumbnail_url = thumbnailUrl || null;
    reviewThumbnailUrl = thumbnailUrl || playbackUrlsFor(cloudflareUid).thumbnailUrl;
  }

  // Best-effort geocoding so this post gets a pin on the map automatically.
  // Never blocks the post itself — if it fails, lat/lng just stay null and
  // the story simply won't show a pin.
  const coords = await geocodeLocation(
    country ? `${location}, ${country}` : location
  );
  insertRow.lat = coords ? coords.lat : null;
  insertRow.lng = coords ? coords.lng : null;

  const { data, error } = await supabaseAdmin
    .from("videos")
    .insert(insertRow)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return jsonError(500, `Could not save story: ${error.message}`);
  }

  // Automatic AI review — checks for NSFW/gore content. If the AI can't
  // reach a verdict (missing ANTHROPIC_API_KEY, network error, unparseable
  // response), the story is left "pending" for manual review in admin.html
  // instead of guessing.
  let finalVideo = data;
  let message = "Saved. It will appear publicly once approved.";
  const review = await reviewVideo({
    title,
    caption,
    location,
    country,
    thumbnailUrl: reviewThumbnailUrl,
    body: reviewBody,
  });

  if (review) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("videos")
      .update({ status: review.verdict, ai_reason: review.reason })
      .eq("id", data.id)
      .select(SELECT_COLUMNS)
      .single();
    if (!updateError && updated) {
      finalVideo = updated;
      message =
        review.verdict === "approved"
          ? "Your story is live!"
          : `Your story wasn't approved: ${review.reason}`;
    }
  }

  return NextResponse.json({ video: finalVideo, message }, { status: 201 });
}
