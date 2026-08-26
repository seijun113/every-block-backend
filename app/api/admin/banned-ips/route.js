import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function checkAdminKey(request) {
  const adminKey = request.headers.get("x-admin-key");
  return !!process.env.ADMIN_API_KEY && adminKey === process.env.ADMIN_API_KEY;
}

// GET /api/admin/banned-ips
// Header: x-admin-key: <ADMIN_API_KEY>
// Lists every currently banned IP address, newest first.
export async function GET(request) {
  if (!checkAdminKey(request)) {
    return jsonError(401, "Missing or invalid x-admin-key header.");
  }

  const { data, error } = await supabaseAdmin
    .from("banned_ips")
    .select("id, ip, reason, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return jsonError(500, `Could not load banned IPs: ${error.message}`);
  }

  return NextResponse.json({ bannedIps: data || [] });
}

// POST /api/admin/banned-ips
// Header: x-admin-key: <ADMIN_API_KEY>
// Body: { ip, reason? }
// Bans an IP address from every /api/* route (enforced in middleware.js).
export async function POST(request) {
  if (!checkAdminKey(request)) {
    return jsonError(401, "Missing or invalid x-admin-key header.");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const ip = (body.ip || "").trim();
  if (!ip) {
    return jsonError(400, "ip is required.");
  }

  const { data, error } = await supabaseAdmin
    .from("banned_ips")
    .upsert({ ip, reason: body.reason || null }, { onConflict: "ip" })
    .select()
    .single();

  if (error) {
    return jsonError(500, `Could not ban that IP: ${error.message}`);
  }

  return NextResponse.json({ bannedIp: data }, { status: 201 });
}
