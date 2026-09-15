import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const VALID_STATUSES = ["open", "resolved", "dismissed"];

// PATCH /api/admin/reports/:id
// Header: x-admin-key: <ADMIN_API_KEY>
// Body: { status: "open"|"resolved"|"dismissed" }
// Updates a report's review status. resolved_at is stamped whenever it
// moves off "open", and cleared if it's ever reopened.
export async function PATCH(request, { params }) {
  const adminKey = request.headers.get("x-admin-key");
  if (!process.env.ADMIN_API_KEY || adminKey !== process.env.ADMIN_API_KEY) {
    return jsonError(401, "Missing or invalid x-admin-key header.");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const status = (body.status || "").trim();
  if (!VALID_STATUSES.includes(status)) {
    return jsonError(400, `status must be one of: ${VALID_STATUSES.join(", ")}.`);
  }

  const { data, error } = await supabaseAdmin
    .from("reports")
    .update({ status, resolved_at: status === "open" ? null : new Date().toISOString() })
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return jsonError(500, `Could not update report: ${error.message}`);
  }
  if (!data) {
    return jsonError(404, "Report not found.");
  }

  return NextResponse.json({ report: data });
}
