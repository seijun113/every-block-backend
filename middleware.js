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

export function middleware(request) {
  const origin = request.headers.get("origin");
  const allowOrigin = resolveOrigin(origin);

  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-key",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const response = NextResponse.next();
  response.headers.set("Access-Control-Allow-Origin", allowOrigin);
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-admin-key");
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
