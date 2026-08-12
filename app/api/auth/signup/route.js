import { NextResponse } from "next/server";
import { supabaseAnon } from "@/lib/supabaseAnon";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/auth/signup
// Body: { email, password, name? }
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { email, password, name } = body || {};
  if (!email || !password) {
    return NextResponse.json(
      { error: "email and password are required." },
      { status: 400 }
    );
  }
  if (String(password).length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAnon.auth.signUp({ email, password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Create the matching profile row. Uses the service-role client since a
  // brand-new signup has no session/RLS context yet.
  if (data.user) {
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: data.user.id,
      email,
      name: name || null,
      shopify_verified: false,
    });
    // 23505 = unique_violation (e.g. a retried signup) — safe to ignore.
    if (profileError && profileError.code !== "23505") {
      return NextResponse.json(
        { error: `Account created but profile setup failed: ${profileError.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    user: data.user ? { id: data.user.id, email: data.user.email } : null,
    session: data.session
      ? {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        }
      : null,
    message: data.session
      ? "Account created and signed in."
      : "Account created. If email confirmation is enabled on your Supabase project, the user must confirm their email before logging in.",
  });
}
