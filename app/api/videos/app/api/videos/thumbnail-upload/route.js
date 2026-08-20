import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB — plenty for a thumbnail image
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// POST /api/videos/thumbnail-upload
// Header: Authorization: Bearer <access_token>
// Body: multipart/form-data with a "thumbnail" file field.
// Optional — only call this if the user picked a custom thumbnail image.
// If they didn't, don't call this at all; the video's auto-generated frame
// (2 seconds in) is used automatically when saving with POST /api/videos.
export async function POST(request) {
  let auth;
  try {
    auth = await requireUser(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Unexpected error.");
  }

  if (!auth.profile?.shopify_verified) {
    return jsonError(403, "Only verified shirt owners can upload a thumbnail.");
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(400, "Expected multipart/form-data with a 'thumbnail' file field.");
  }

  const file = formData.get("thumbnail");
  if (!file || typeof file === "string") {
    return jsonError(400, "No thumbnail file found in the request (field name must be 'thumbnail').");
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return jsonError(400, "Thumbnail must be a JPEG, PNG, WEBP, or GIF image.");
  }
  if (file.size > MAX_BYTES) {
    return jsonError(400, "Thumbnail must be under 5MB.");
  }

  const ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const path = `${auth.user.id}/${Date.now()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage
    .from("thumbnails")
    .upload(path, bytes, { contentType: file.type, upsert: true });

  if (uploadError) {
    return jsonError(500, `Could not upload thumbnail: ${uploadError.message}`);
  }

  const { data } = supabaseAdmin.storage.from("thumbnails").getPublicUrl(path);

  return NextResponse.json({ thumbnailUrl: data.publicUrl });
}
