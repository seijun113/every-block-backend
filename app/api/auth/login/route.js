import { NextResponse } from "next/server";
import { supabaseAnon } from "@/lib/supabaseAnon";

// POST /api/auth/login
// Body: { email, password }
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { email, password } = body || {};
  if (!email || !password) {
    return NextResponse.json(
      { error: "email and password are required." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAnon.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  return NextResponse.json({
    user: { id: data.user.id, email: data.user.email },
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    },
  });
}
