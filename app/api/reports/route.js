import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const VALID_TYPES = ["video", "comment", "profile"];
const MAX_REASON = 200;
const MAX_DETAILS = 1000;

// Looks up a short human-readable label for whatever's being reported, so
// the admin panel can show useful context (a video's title, a comment's
// text, a profile's name) without joining three different tables later —
// it's captured once, at report time, as a plain snapshot.
async function buildSnapshot(targetType, targetId) {
  try {
    if (targetType === "video") {
      const { data } = await supabaseAdmin.from("videos").select("title").eq("id", targetId).single();
      return data ? `Video: ${data.title || "Untitled"}` : null;
    }
    if (targetType === "comment") {
      const { data } = await supabaseAdmin.from("comments").select("body").eq("id", targetId).single();
      return data ? `Comment: ${(data.body || "").slice(0, 140)}` : null;
    }
    if (targetType === "profile") {
      const { data } = await supabaseAdmin.from("profiles").select("name").eq("id", targetId).single();
      return data ? `Profile: ${data.name || "Anonymous"}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

// POST /api/reports
// Header: Authorization: Bearer <access_token>
// Body: { targetType: "video"|"comment"|"profile", targetId, reason, details? }
// Any logged-in account can file a report. Reports are reviewed later by
// the site owner via GET/PATCH /api/admin/reports (admin-key gated).
export async function POST(request) {
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

  const targetType = (body.targetType || "").trim();
  const targetId = (body.targetId || "").trim();
  const reason = (body.reason || "").trim();
  const details = (body.details || "").trim();

  if (!VALID_TYPES.includes(targetType)) {
    return jsonError(400, `targetType must be one of: ${VALID_TYPES.join(", ")}.`);
  }
  if (!targetId) {
    return jsonError(400, "targetId is required.");
  }
  if (!reason) {
    return jsonError(400, "A reason is required.");
  }
  if (reason.length > MAX_REASON) {
    return jsonError(400, `Reason must be under ${MAX_REASON} characters.`);
  }
  if (details.length > MAX_DETAILS) {
    return jsonError(400, `Details must be under ${MAX_DETAILS} characters.`);
  }

  const targetSnapshot = await buildSnapshot(targetType, targetId);

  const { data, error } = await supabaseAdmin
    .from("reports")
    .insert({
      reporter_id: auth.user.id,
      target_type: targetType,
      target_id: targetId,
      target_snapshot: targetSnapshot,
      reason,
      details: details || null,
    })
    .select()
    .single();

  if (error) {
    return jsonError(500, `Could not file report: ${error.message}`);
  }

  return NextResponse.json({ report: data }, { status: 201 });
}
