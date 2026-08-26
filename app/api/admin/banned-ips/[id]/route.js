import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// DELETE /api/admin/banned-ips/:id
// Header: x-admin-key: <ADMIN_API_KEY>
// Unbans an IP address (removes the row by its id, not the raw IP string).
export async function DELETE(request, { params }) {
  const adminKey = request.headers.get("x-admin-key");
  if (!process.env.ADMIN_API_KEY || adminKey !== process.env.ADMIN_API_KEY) {
    return jsonError(401, "Missing or invalid x-admin-key header.");
  }

  const { error } = await supabaseAdmin
    .from("banned_ips")
    .delete()
    .eq("id", params.id);

  if (error) {
    return jsonError(500, `Could not unban that IP: ${error.message}`);
  }

  return NextResponse.json({ message: "Unbanned." });
}
