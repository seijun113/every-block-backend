import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/videos/:id/share
// No login required — sharing is a lightweight, repeatable action (unlike
// likes/saves there's nothing to "undo"), so this just bumps a counter each
// time someone uses the Share button. Called after the browser's own share
// sheet / clipboard copy has already happened; this only tracks the count.
export async function POST(request, { params }) {
  const { data: video, error: videoError } = await supabaseAdmin
    .from("videos")
    .select("share_count")
    .eq("id", params.id)
    .single();
  if (videoError || !video) {
    return jsonError(404, "Story not found.");
  }

  const { data: updated, error } = await supabaseAdmin
    .from("videos")
    .update({ share_count: (video.share_count || 0) + 1 })
    .eq("id", params.id)
    .select("share_count")
    .single();
  if (error) {
    return jsonError(500, `Could not record share: ${error.message}`);
  }

  return NextResponse.json({ shareCount: updated.share_count });
}
