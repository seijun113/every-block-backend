import { NextResponse } from "next/server";
import crypto from "crypto";
import { buildInstallUrl } from "@/lib/shopifyOAuth";

// GET /api/shopify/oauth/install?key=<ADMIN_API_KEY>
//
// Visiting this URL (signed into Shopify admin as the store owner/staff)
// kicks off a one-time OAuth install/re-authorize of the existing Backend
// API app, ending on the callback route with a real Admin API access
// token. This is the modern replacement for the old custom-app "reveal
// token once" button: apps built through Shopify's newer Dev
// Dashboard/CLI system only issue OAuth Client ID/Secret pairs, not a
// static token, in their admin UI.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: "Missing or invalid key query parameter." }, { status: 401 });
  }

  const shop = process.env.SHOPIFY_STORE_DOMAIN;
  if (!shop) {
    return NextResponse.json({ error: "Missing SHOPIFY_STORE_DOMAIN environment variable." }, { status: 500 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${new URL(request.url).origin}/api/shopify/oauth/callback`;
  const installUrl = buildInstallUrl({ shop, redirectUri, state });

  const response = NextResponse.redirect(installUrl);
  response.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: true,
    maxAge: 600,
    path: "/",
  });
  return response;
}
