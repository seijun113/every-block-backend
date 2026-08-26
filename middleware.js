import { NextResponse } from "next/server";

// Your static site (GitHub Pages, Wix, etc.) lives on a different origin
// than this API, so every /api/* route needs CORS headers. This runs before
// every matched request — including handling the browser's OPTIONS
// preflight — so individual route handlers don't need to repeat this logic.

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function resolveOrigin(requestOrigin) {
  if (ALLOWED_ORIGINS.includes("*")) return "*";
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  return ALLOWED_ORIGINS[0] || "*";
}

// Best-effort client IP, same logic as lib/getClientIp.js (duplicated here
// since middleware runs in a separate, minimal runtime and this needs to
// stay dependency-free).
function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") || null;
}

// Checks the banned_ips table via a direct REST call (not the supabase-js
// client) so this stays lightweight and safely runs in Vercel's Edge
// runtime. Fails open (treats as "not banned") if Supabase is unreachable
// or env vars are missing — a moderation feature should never be the thing
// that takes your whole API down.
async function isBanned(ip) {
  if (!ip) return false;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;

  try {
    const res = await fetch(
      `${url}/rest/v1/banned_ips?ip=eq.${encodeURIComponent(ip)}&select=ip`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

function withCors(response, allowOrigin) {
  response.headers.set("Access-Control-Allow-Origin", allowOrigin);
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-admin-key");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

export async function middleware(request) {
  const origin = request.headers.get("origin");
  const allowOrigin = resolveOrigin(origin);

  if (request.method === "OPTIONS") {
    return withCors(new NextResponse(null, { status: 204 }), allowOrigin);
  }

  const ip = getClientIp(request);
  if (await isBanned(ip)) {
    return withCors(
      NextResponse.json({ error: "Access denied." }, { status: 403 }),
      allowOrigin
    );
  }

  return withCors(NextResponse.next(), allowOrigin);
}

export const config = {
  matcher: "/api/:path*",
};
