import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonError } from "@/lib/auth";

// PATCH /api/videos/:id/approve
// Header: x-admin-key: <ADMIN_API_KEY>
// Body (optional): { status: "approved" | "rejected" | "pending" }  (default: "approved")
//
// Optional bonus endpoint — the four features you asked for don't strictly
// need this, since you can just flip a video's `status` column to
// "approved" directly in the Supabase table editor. This exists for when
// you want in-app moderation instead. The gate here is intentionally
// minimal (a single shared secret) — swap in real admin auth (e.g. an
// is_admin column checked via requireUser) before this matters for a team
// bigger than just you.
export async function PATCH(request, { params }) {
  const adminKey = request.headers.get("x-admin-key");
  if (!process.env.ADMIN_API_KEY || adminKey !== process.env.ADMIN_API_KEY) {
    return jsonError(401, "Missing or invalid x-admin-key header.");
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    // default to approving
  }
  const status = body.status || "approved";
  if (!["approved", "rejected", "pending"].includes(status)) {
    return jsonError(400, "status must be 'approved', 'rejected', or 'pending'.");
  }

  const { data, error } = await supabaseAdmin
    .from("videos")
    .update({ status })
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return jsonError(500, `Could not update video: ${error.message}`);
  }

  return NextResponse.json({ video: data });
}
