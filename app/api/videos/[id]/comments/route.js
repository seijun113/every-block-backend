import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MAX_LENGTH = 1000;

// GET /api/videos/:id/comments
// Public — no auth required. Returns every comment on a story, oldest first
// (so new ones appear at the bottom, like a normal comment thread).
export async function GET(request, { params }) {
  // profile_id is included so the frontend can show a "Delete" option only
  // on the viewer's own comments — it's just an opaque id, not sensitive.
  const { data, error } = await supabaseAdmin
    .from("comments")
    .select("id, profile_id, author, body, created_at")
    .eq("video_id", params.id)
    .order("created_at", { ascending: true });

  if (error) {
    return jsonError(500, `Could not load comments: ${error.message}`);
  }

  return NextResponse.json({ comments: data || [] });
}

// POST /api/videos/:id/comments
// Header: Authorization: Bearer <access_token>
// Body: { body }
// Any logged-in account can comment — unlike posting a story, this does
// NOT require Shopify purchase verification.
export async function POST(request, { params }) {
  let auth;
  try {
    auth = await requireUser(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Unexpected error.");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const text = (body.body || "").trim();
  if (!text) {
    return jsonError(400, "Comment text is required.");
  }
  if (text.length > MAX_LENGTH) {
    return jsonError(400, `Comments must be under ${MAX_LENGTH} characters.`);
  }

  // Confirm the story actually exists so comments can't be attached to a
  // deleted or made-up id.
  const { data: video, error: videoError } = await supabaseAdmin
    .from("videos")
    .select("id")
    .eq("id", params.id)
    .single();

  if (videoError || !video) {
    return jsonError(404, "Story not found.");
  }

  const { data, error } = await supabaseAdmin
    .from("comments")
    .insert({
      video_id: params.id,
      profile_id: auth.user.id,
      author: auth.profile?.name || "Anonymous",
      body: text,
    })
    .select()
    .single();

  if (error) {
    return jsonError(500, `Could not post comment: ${error.message}`);
  }

  return NextResponse.json({ comment: data }, { status: 201 });
}
