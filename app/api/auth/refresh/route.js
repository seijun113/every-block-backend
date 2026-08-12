import { NextResponse } from "next/server";
import { supabaseAnon } from "@/lib/supabaseAnon";

// POST /api/auth/refresh
// Body: { refresh_token }
// Supabase access tokens expire (1 hour by default) — call this before then
// with the stored refresh_token to get a new pair without forcing a re-login.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { refresh_token } = body || {};
  if (!refresh_token) {
    return NextResponse.json({ error: "refresh_token is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token });
  if (error || !data.session) {
    return NextResponse.json(
      { error: "Could not refresh session. Please log in again." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    },
  });
}
