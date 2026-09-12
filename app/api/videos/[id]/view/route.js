import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/videos/:id/view
// No login required — like share, this just bumps a lightweight counter.
// The frontend calls this once per story per browser session (see
// recordStoryView in script.js) so refreshing the story page repeatedly
// doesn't inflate the count.
export async function POST(request, { params }) {
  const { data: video, error: videoError } = await supabaseAdmin
    .from("videos")
    .select("view_count")
    .eq("id", params.id)
    .single();
  if (videoError || !video) {
    return jsonError(404, "Story not found.");
  }

  const { data: updated, error } = await supabaseAdmin
    .from("videos")
    .update({ view_count: (video.view_count || 0) + 1 })
    .eq("id", params.id)
    .select("view_count")
    .single();
  if (error) {
    return jsonError(500, `Could not record view: ${error.message}`);
  }

  return NextResponse.json({ viewCount: updated.view_count });
}
