import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { deleteStreamVideo } from "@/lib/cloudflareStream";

// DELETE /api/videos/:id
// Header: Authorization: Bearer <access_token>
// Lets a user delete one of their own posted stories (any status —
// pending, approved, or rejected). Also best-effort deletes the underlying
// Cloudflare Stream video and any custom thumbnail image, so nothing
// orphaned keeps costing storage after it's gone from the site.
export async function DELETE(request, { params }) {
  let auth;
  try {
    auth = await requireUser(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Unexpected error.");
  }

  const { data: video, error: fetchError } = await supabaseAdmin
    .from("videos")
    .select("id, profile_id, cloudflare_uid, thumbnail_url")
    .eq("id", params.id)
    .single();

  if (fetchError || !video) {
    return jsonError(404, "Story not found.");
  }

  if (video.profile_id !== auth.user.id) {
    return jsonError(403, "You can only delete your own stories.");
  }

  const { error: deleteError } = await supabaseAdmin
    .from("videos")
    .delete()
    .eq("id", params.id);

  if (deleteError) {
    return jsonError(500, `Could not delete story: ${deleteError.message}`);
  }

  // Best-effort cleanup. Never block the response on these — the story
  // record is already gone, which is what matters most to the user.
  if (video.cloudflare_uid) {
    deleteStreamVideo(video.cloudflare_uid).catch(() => {});
  }
  if (video.thumbnail_url) {
    deleteCustomThumbnail(video.thumbnail_url).catch(() => {});
  }

  return NextResponse.json({ message: "Story deleted." });
}

async function deleteCustomThumbnail(url) {
  const marker = "/storage/v1/object/public/thumbnails/";
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = url.slice(idx + marker.length);
  await supabaseAdmin.storage.from("thumbnails").remove([path]);
}
