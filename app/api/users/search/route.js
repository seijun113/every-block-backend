import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/users/search?q=...
// Public — no auth required. Looks up profiles whose name contains the
// query (case-insensitive) for the profile search bar. Returns just enough
// to render a result card: id, name, bio, and how many approved stories
// they've posted, so results aren't just a bare list of names.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) {
    return NextResponse.json({ profiles: [] });
  }
  if (q.length > 100) {
    return jsonError(400, "Search term is too long.");
  }

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, name, bio, created_at")
    .ilike("name", `%${q}%`)
    .order("name", { ascending: true })
    .limit(20);

  if (error) {
    return jsonError(500, `Couldn't search profiles: ${error.message}`);
  }

  const ids = (profiles || []).map((p) => p.id);
  const storyCounts = {};
  if (ids.length) {
    const { data: videoRows } = await supabaseAdmin
      .from("videos")
      .select("profile_id")
      .eq("status", "approved")
      .in("profile_id", ids);
    (videoRows || []).forEach((v) => {
      storyCounts[v.profile_id] = (storyCounts[v.profile_id] || 0) + 1;
    });
  }

  return NextResponse.json({
    profiles: (profiles || []).map((p) => ({
      id: p.id,
      name: p.name,
      bio: p.bio || null,
      storyCount: storyCounts[p.id] || 0,
    })),
  });
}
