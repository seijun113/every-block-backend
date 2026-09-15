import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { reviewProfilePhoto } from "@/lib/aiReview";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const EXT_BY_TYPE = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

// POST /api/users/me/photo
// Header: Authorization: Bearer <access_token>
// Body: multipart/form-data with a "photo" file field and a "type" field
// that's either "avatar" or "banner". Any logged-in user can set their own
// profile photo/banner — no Shopify verification required, this is just
// personalizing the account, not posting content. Uploads reuse the same
// "thumbnails" storage bucket as video thumbnails, under a profile-photos/
// prefix, so no extra bucket has to be created in Supabase.
export async function POST(request) {
  let auth;
  try {
    auth = await requireUser(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Unexpected error.");
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(400, "Expected multipart/form-data with a 'photo' file field.");
  }

  const type = formData.get("type");
  if (type !== "avatar" && type !== "banner") {
    return jsonError(400, "'type' must be 'avatar' or 'banner'.");
  }

  const file = formData.get("photo");
  if (!file || typeof file === "string") {
    return jsonError(400, "No photo file found in the request (field name must be 'photo').");
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return jsonError(400, "Photo must be a JPEG, PNG, WEBP, or GIF image.");
  }
  if (file.size > MAX_BYTES) {
    return jsonError(400, "Photo must be under 5MB.");
  }

  const ext = EXT_BY_TYPE[file.type] || "jpg";
  const path = `profile-photos/${auth.user.id}/${type}-${Date.now()}.${ext}`;

  let bytes;
  try {
    bytes = Buffer.from(await file.arrayBuffer());
  } catch (err) {
    return jsonError(400, `Couldn't read the uploaded file: ${err.message}`);
  }

  let uploadError;
  try {
    const result = await supabaseAdmin.storage
      .from("thumbnails")
      .upload(path, bytes, { contentType: file.type, upsert: true });
    uploadError = result.error;
  } catch (err) {
    return jsonError(500, `Could not upload photo: ${err.message}. Make sure the "thumbnails" storage bucket exists in Supabase.`);
  }
  if (uploadError) {
    return jsonError(500, `Could not upload photo: ${uploadError.message}`);
  }

  const { data } = supabaseAdmin.storage.from("thumbnails").getPublicUrl(path);
  const url = data.publicUrl;
  const column = type === "avatar" ? "avatar_url" : "banner_url";

  // Automatic NSFW/appropriateness check before this becomes someone's
  // public-facing photo. If the AI can't reach a verdict (missing
  // ANTHROPIC_API_KEY, network error, unparseable response), fail OPEN —
  // allow the upload — rather than block a legitimate photo just because
  // moderation is temporarily unavailable. Only an explicit "rejected"
  // verdict blocks it.
  const review = await reviewProfilePhoto({ imageUrl: url, type });
  if (review && review.verdict === "rejected") {
    await supabaseAdmin.storage.from("thumbnails").remove([path]);
    return jsonError(400, `That image wasn't approved: ${review.reason}`);
  }

  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ [column]: url })
    .eq("id", auth.user.id);
  if (updateError) {
    return jsonError(500, `Uploaded, but couldn't save it to your profile: ${updateError.message}`);
  }

  return NextResponse.json({ type, url, avatarUrl: type === "avatar" ? url : undefined, bannerUrl: type === "banner" ? url : undefined });
}
