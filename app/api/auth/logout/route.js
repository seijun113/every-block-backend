import { NextResponse } from "next/server";

// POST /api/auth/logout
// Sessions here are stateless Bearer tokens (no server-side cookie/session
// store), so "logging out" is simply the client discarding its stored
// access_token and refresh_token. This endpoint exists so the frontend has
// a consistent call to make either way.
export async function POST() {
  return NextResponse.json({
    message: "Logged out. Discard the access_token and refresh_token stored on the client.",
  });
}
