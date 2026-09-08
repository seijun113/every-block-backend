import { NextResponse } from "next/server";
import { verifyOAuthHmac, exchangeCodeForToken } from "@/lib/shopifyOAuth";

// GET /api/shopify/oauth/callback
// Shopify redirects here after the store owner approves the install
// started at /api/shopify/oauth/install. Exchanges the one-time code for a
// permanent Admin API access token and displays it ONCE so it can be
// copied into Vercel as SHOPIFY_ADMIN_API_TOKEN -- mirroring the old
// custom-app "reveal token once" flow, just reached a different way.
export async function GET(request) {
  const url = new URL(request.url);
  const { searchParams } = url;

  const shop = searchParams.get("shop");
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieState = request.cookies.get("shopify_oauth_state")?.value;
  if (!state || !cookieState || state !== cookieState) {
    return NextResponse.json(
      { error: "State mismatch or expired. Start over at /api/shopify/oauth/install." },
      { status: 400 }
    );
  }

  let hmacOk;
  try {
    hmacOk = verifyOAuthHmac(searchParams);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  if (!hmacOk) {
    return NextResponse.json({ error: "Invalid HMAC signature from Shopify." }, { status: 401 });
  }

  const expectedShop = process.env.SHOPIFY_STORE_DOMAIN;
  if (!shop || shop !== expectedShop) {
    return NextResponse.json({ error: "Unexpected shop domain." }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: "Missing code parameter." }, { status: 400 });
  }

  let accessToken;
  try {
    accessToken = await exchangeCodeForToken({ shop, code });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Shopify app installed</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 640px; margin: 60px auto; line-height: 1.5;">
  <h1>Installed successfully</h1>
  <p>Copy this Admin API access token into Vercel as <code>SHOPIFY_ADMIN_API_TOKEN</code>, then redeploy. This page will not show it again.</p>
  <p style="background:#f3f3f3; padding:12px; border-radius:6px; word-break:break-all; font-family: monospace;">${accessToken}</p>
  <p>Once it's saved in Vercel, you can close this tab.</p>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
