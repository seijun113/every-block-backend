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
 *
 * A row can be a "video" post (has cloudflare_uid, gets iframe/thumbnail
 * playback URLs) or a "blog" post (post_type "blog" — text + photo_urls,
 * no video at all). playbackUrlsFor is only called when a cloudflare_uid
 * is actually present, so blog rows don't get bogus playback URLs built
 * from an undefined uid.
 */
export function serializeVideos(rows, { likeCounts = {}, likedSet = new Set(), savedSet = new Set() } = {}) {
  return (rows || []).map((v) => {
    const playback = v.cloudflare_uid ? playbackUrlsFor(v.cloudflare_uid) : { iframeUrl: null, thumbnailUrl: null };
    return {
      ...v,
      ...playback,
      postType: v.post_type || "video",
      body: v.body || null,
      photoUrls: v.photo_urls || [],
      thumbnailUrl: v.thumbnail_url || playback.thumbnailUrl || (v.photo_urls && v.photo_urls[0]) || null,
      likeCount: likeCounts[v.id] || 0,
      liked: likedSet.has(v.id),
      saved: savedSet.has(v.id),
      shareCount: v.share_count || 0,
      viewCount: v.view_count || 0,
    };
  });
}
