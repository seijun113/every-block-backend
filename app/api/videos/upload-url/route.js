import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { createDirectUploadUrl } from "@/lib/cloudflareStream";

// POST /api/videos/upload-url
// Header: Authorization: Bearer <access_token>
// Body (optional): { maxDurationSeconds, title }
// Only verified shirt owners get an upload URL. The client then POSTs the
// video file directly to the returned uploadURL — it never touches this
// backend, so there's no file-size limit imposed by this server.
export async function POST(request) {
  let auth;
  try {
    auth = await requireUser(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Unexpected error.");
  }

  if (!auth.profile?.shopify_verified) {
    return jsonError(
      403,
      "Only verified shirt owners can post a video. Verify your Shopify order first."
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine — defaults apply.
  }

  const maxDurationSeconds = Math.min(
    Math.max(Number(body.maxDurationSeconds) || 120, 1),
    300
  );

  try {
    const { uploadURL, uid } = await createDirectUploadUrl({
      maxDurationSeconds,
      name: body.title || undefined,
    });
    return NextResponse.json({ uploadURL, uid });
  } catch (err) {
    return jsonError(502, `Could not create upload URL: ${err.message}`);
  }
}
