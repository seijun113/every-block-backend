import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const VALID_STATUSES = ["open", "resolved", "dismissed"];

// GET /api/admin/reports?status=open|resolved|dismissed|all
// Header: x-admin-key: <ADMIN_API_KEY>
// Lists filed reports for manual review, newest first. Embeds the
// reporter's display name via the reports.reporter_id -> profiles.id
// foreign key so the panel can show "reported by X" without a second query.
export async function GET(request) {
  const adminKey = request.headers.get("x-admin-key");
  if (!process.env.ADMIN_API_KEY || adminKey !== process.env.ADMIN_API_KEY) {
    return jsonError(401, "Missing or invalid x-admin-key header.");
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "open";

  let query = supabaseAdmin
    .from("reports")
    .select("id, reporter_id, target_type, target_id, target_snapshot, reason, details, status, created_at, resolved_at, reporter:profiles(name)")
    .order("created_at", { ascending: false });

  if (status !== "all") {
    if (!VALID_STATUSES.includes(status)) {
      return jsonError(400, `status must be 'open', 'resolved', 'dismissed', or 'all'.`);
    }
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return jsonError(500, `Could not load reports: ${error.message}`);
  }

  return NextResponse.json({ reports: data || [] });
}
