/**
 * Best-effort extraction of the requester's IP address. Vercel sets
 * x-forwarded-for on every request (the first value is the original
 * client), which works the same way whether this runs as a Node.js
 * serverless function or an Edge function.
 */
export function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") || null;
}
