import { playbackUrlsFor } from "./cloudflareStream";

/**
 * Counts rows by a key, e.g. countBy(likeRows, "video_id") -> { "<id>": 3 }.
 * Used instead of a SQL GROUP BY so this stays plain Supabase-JS (no
 * database functions to maintain) — fine at this app's scale.
 */
export function countBy(rows, key) {
  const map = {};
  (rows || []).forEach((r) => {
    const k = r[key];
    if (k === undefined || k === null) return;
    map[k] = (map[k] || 0) + 1;
  });
  return map;
}

/**
 * Turns raw `videos` rows into the shape the frontend expects: playback
 * URLs, thumbnail fallback, and social counts/flags. `likeCounts` is a
 * { videoId: count } map (see countBy above); `likedSet`/`savedSet` are
 * Sets of video ids the *current viewer* has liked/saved (empty if nobody
 * is logged in — every video just comes back liked:false, saved:false).
 */
export function serializeVideos(rows, { likeCounts = {}, likedSet = new Set(), savedSet = new Set() } = {}) {
  return (rows || []).map((v) => {
    const playback = playbackUrlsFor(v.cloudflare_uid);
    return {
      ...v,
      ...playback,
      thumbnailUrl: v.thumbnail_url || playback.thumbnailUrl,
      likeCount: likeCounts[v.id] || 0,
      liked: likedSet.has(v.id),
      saved: savedSet.has(v.id),
      shareCount: v.share_count || 0,
    };
  });
}
