import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";

// GET /api/auth/session
// Header: Authorization: Bearer <access_token>
// Lets the frontend check "am I logged in, and am I verified?" on page load.
export async function GET(request) {
  try {
    const { user, profile } = await requireUser(request);
    return NextResponse.json({
      user: { id: user.id, email: user.email },
      profile: {
        name: profile?.name || null,
        shopify_verified: !!profile?.shopify_verified,
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Unexpected error.");
  }
}
