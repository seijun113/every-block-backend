// Automatic AI moderation for newly posted stories. Called right after a
// video is inserted (see POST /api/videos): asks Claude to look at the
// story's title/caption/location and, if a thumbnail frame is ready yet,
// the thumbnail image, then returns a verdict. On any failure (missing
// ANTHROPIC_API_KEY, network error, unparseable response) this returns
// null so the caller leaves the video "pending" for manual review in
// admin.html instead of guessing.

const REVIEW_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are the content moderator for "Every Block Has a Story," a site where people post short videos. You will be shown a submission's title, caption, and location, and — if available — a thumbnail frame from the video. Decide whether this submission should be approved or rejected.

Reject ONLY if the content contains nudity or sexual content, or graphic violence/gore. That is the sole bar.

Approve everything else — including spam, off-topic content, low-effort or joke submissions, short/casual/imperfectly written posts, or anything unrelated to a neighborhood story. Do not reject for topic relevance, quality, or effort. Only nudity/sexual content or graphic violence/gore should ever be rejected.

Respond with ONLY a JSON object, no other text, in this exact shape:
{"verdict": "approved" | "rejected", "reason": "one short sentence explaining why"}`;

async function fetchImageBase64(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    // Cloudflare's auto-thumbnail can be a tiny placeholder in the first
    // moments after upload, before the video finishes encoding — a real
    // frame is almost always bigger than this.
    if (buf.byteLength < 2000) return null;
    return { mediaType: contentType, data: Buffer.from(buf).toString("base64") };
  } catch {
    return null;
  }
}

/**
 * Reviews one submission. Returns { verdict: "approved"|"rejected", reason }
 * or null if the review couldn't be completed (caller should leave the
 * video "pending" in that case, not guess).
 */

const PHOTO_REVIEW_SYSTEM_PROMPT = `You are the content moderator for "Every Block Has a Story," a general-audience family site. You will be shown an image a user wants to use as their profile picture or profile banner. Decide whether it's appropriate.
Reject if the image contains nudity, sexual content, graphic violence or gore, hate symbols, or other content inappropriate for a general-audience family site.
Approve everything else, including ordinary photos of people, pets, logos, art, landscapes, or anything else that isn't NSFW — the bar is "is this safe for a general audience," not "is this a good photo."
Respond with ONLY a JSON object, no other text, in this exact shape:
{"verdict": "approved" | "rejected", "reason": "one short sentence explaining why"}`;

/**
 * Reviews an uploaded profile photo or banner image for NSFW/inappropriate
 * content. Returns { verdict, reason } or null if the review couldn't be
 * completed — the caller should fail OPEN (allow the upload) in that case,
 * rather than block someone from setting a profile photo just because the
 * moderation API is temporarily unavailable.
 */
export async function reviewProfilePhoto({ imageUrl, type }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const image = await fetchImageBase64(imageUrl);
  if (!image) return null;

  const content = [
    { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
    { type: "text", text: `This is a user's ${type === "banner" ? "profile banner" : "profile picture"}.` },
  ];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: REVIEW_MODEL,
        max_tokens: 150,
        system: PHOTO_REVIEW_SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data.content || []).map((b) => b.text || "").join("").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.verdict !== "approved" && parsed.verdict !== "rejected") return null;
    return { verdict: parsed.verdict, reason: String(parsed.reason || "").slice(0, 300) };
  } catch {
    return null;
  }
}

export async function reviewVideo({ title, caption, location, country, thumbnailUrl }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const image = await fetchImageBase64(thumbnailUrl);

  const textParts = [
    `Title: ${title || "(none)"}`,
    `Caption: ${caption || "(none)"}`,
    `Location: ${[location, country].filter(Boolean).join(", ") || "(none)"}`,
    image ? "" : "(No thumbnail image was available yet — judge based on the text alone.)",
  ].filter(Boolean).join("\n");

  const content = [];
  if (image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.data },
    });
  }
  content.push({ type: "text", text: textParts });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: REVIEW_MODEL,
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data.content || []).map((b) => b.text || "").join("").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.verdict !== "approved" && parsed.verdict !== "rejected") return null;
    return { verdict: parsed.verdict, reason: String(parsed.reason || "").slice(0, 300) };
  } catch {
    return null;
  }
}
