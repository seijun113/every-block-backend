/**
 * Requests a one-time direct-upload URL from Cloudflare Stream. The returned
 * uploadURL is POSTed to directly from the visitor's browser — the video's
 * bytes never pass through this backend, only this short-lived URL does.
 * https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
 */
export async function createDirectUploadUrl({
  maxDurationSeconds = 180,
  name,
  allowedOrigins,
} = {}) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!accountId || !token) {
    throw new Error(
      "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_STREAM_API_TOKEN environment variables."
    );
  }

  const body = {
    maxDurationSeconds,
    requireSignedURLs: false,
  };
  if (name) body.meta = { name };
  if (allowedOrigins) body.allowedOrigins = allowedOrigins;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(`Cloudflare Stream error: ${JSON.stringify(data.errors || data)}`);
  }

  return { uploadURL: data.result.uploadURL, uid: data.result.uid };
}

/**
 * Deletes a video from Cloudflare Stream. Used when a user deletes one of
 * their own posted stories, so we're not still paying to store/serve a
 * video nobody can see anymore. Best-effort — failures are swallowed by
 * the caller rather than blocking the story deletion itself.
 */
export async function deleteStreamVideo(uid) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!accountId || !token || !uid) return;

  await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Builds playback URLs for a given Stream video UID. Requires
 * CLOUDFLARE_STREAM_CUSTOMER_CODE — the "customer-XXXX" code shown in your
 * Stream dashboard's own playback URLs.
 * https://developers.cloudflare.com/stream/viewing-videos/using-the-stream-player/using-the-player-api/
 */
export function playbackUrlsFor(uid) {
  const code = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE;
  if (!code) return { iframeUrl: null, thumbnailUrl: null };
  return {
    iframeUrl: `https://customer-${code}.cloudflarestream.com/${uid}/iframe`,
    // ?time=2s — the auto-generated thumbnail when no custom one was uploaded.
    thumbnailUrl: `https://customer-${code}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg?time=2s`,
  };
}
