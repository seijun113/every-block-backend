import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// DELETE /api/comments/:id
// Header: Authorization: Bearer <access_token>
// Lets a user delete one of their own comments. Anyone else's comment_id
// gets a 403, even if they know the id.
export async function DELETE(request, { params }) {
  let auth;
  try {
    auth = await requireUser(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Unexpected error.");
  }

  const { data: comment, error: fetchError } = await supabaseAdmin
    .from("comments")
    .select("id, profile_id")
    .eq("id", params.id)
    .single();

  if (fetchError || !comment) {
    return jsonError(404, "Comment not found.");
  }

  if (comment.profile_id !== auth.user.id) {
    return jsonError(403, "You can only delete your own comments.");
  }

  const { error: deleteError } = await supabaseAdmin
    .from("comments")
    .delete()
    .eq("id", params.id);

  if (deleteError) {
    return jsonError(500, `Could not delete comment: ${deleteError.message}`);
  }

  return NextResponse.json({ message: "Comment deleted." });
}
