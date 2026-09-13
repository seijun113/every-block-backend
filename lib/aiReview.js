// Automatic AI moderation for newly posted stories. Called right after a
// video is inserted (see POST /api/videos): asks Claude to look at the
// story's title/caption/location and, if a thumbnail frame is ready yet,
// the thumbnail image, then returns a verdict. On any failure (missing
// ANTHROPIC_API_KEY, network error, unparseable response) this returns
// null so the caller leaves the video "pending" for manual review in
// admin.html instead of guessing.

const REVIEW_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are the content moderator for "Every Block Has a Story," a site where people post short videos about their neighborhood or block. You will be shown a submission's title, caption, and location, and — if available — a thumbnail frame from the video. Decide whether this submission should be approved or rejected.

Reject if ANY of these are true:
- It contains nudity, graphic violence, hate speech, harassment, or other content inappropriate for a general-audience family site.
- It's spam, an advertisement unrelated to sharing a neighborhood story, or low-effort junk (blank/gibberish title or caption, testing text like "asdf" or "test").
- It is clearly not a story about a block, neighborhood, city, or community — completely off-topic.

Approve everything else, including submissions that are simply short, casual, or imperfectly written — the bar is "is this a real, appropriate attempt at a neighborhood story," not "is this good."

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
