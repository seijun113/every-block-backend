# Every Block Has a Story — Backend API

A Next.js app that's just API routes, meant to be deployed to Vercel. Your
static site (GitHub Pages, Wix, wherever) calls it over `fetch()`. All
secrets — Supabase's service-role key, your Shopify Admin API token, your
Cloudflare Stream API token — stay in Vercel's environment variables and are
only ever read in server-side route handler code. None of them ship to a
browser.

## What's here

- **Auth** — signup / login / refresh / logout / session check, backed by Supabase Auth.
- **Shopify purchase verification** — confirms a logged-in user's order actually contains the Every Block Tee and is paid, then marks their account verified.
- **Cloudflare Stream uploads** — generates one-time direct-upload URLs so video files go straight from the visitor's browser to Cloudflare, never through this server.
- **Video records in Supabase** — saves metadata (title, caption, location, etc.) for each uploaded video as `pending`, and serves only `approved` ones publicly.

## Architecture notes

**Auth is Bearer-token based, not cookies.** Your static site almost
certainly lives on a different origin than this API (e.g.
`yourname.github.io` vs `your-api.vercel.app`), and cross-site cookies are
increasingly unreliable across browsers. So login/signup return an
`access_token` in the JSON response body — store it in `localStorage` on the
frontend (the rest of this site's account state already lives there, so
this is consistent) and send it as `Authorization: Bearer <token>` on every
protected call.

**Videos never touch this server.** `/api/videos/upload-url` asks
Cloudflare for a one-time upload URL; the browser then POSTs the file
straight to Cloudflare. This backend only ever handles the small JSON
metadata, not video bytes — so there's no risk of a Vercel function timing
out or hitting a payload-size limit on a large upload.

**Moderation is manual by default.** New videos save as `status: "pending"`.
The simplest way to publish one is to open the `videos` table in Supabase's
table editor and change its `status` to `approved`. There's also an
optional `/api/videos/[id]/approve` route gated by a shared secret
(`ADMIN_API_KEY`) if you'd rather do it over the API.

## One-time setup

### 1. Supabase

Create a project at [supabase.com](https://supabase.com). In the SQL
Editor, run everything in `schema.sql` from this folder. Then grab, from
Settings → API: your Project URL, the `anon` `public` key, and the
`service_role` key.

### 2. Shopify

In your Shopify admin: Settings → Apps and sales channels → Develop apps →
Create an app. Configure Admin API scopes to include `read_orders`, install
the app, and copy the generated Admin API access token
(`shpat_...`). Your store domain is `everybodyhasastory.myshopify.com` and
the Every Block Tee's numeric product ID is `10564552130879` (from the
product we already created — `gid://shopify/Product/10564552130879`).

### 3. Cloudflare Stream

In the Cloudflare dashboard: Stream (enable it if you haven't). Find your
Account ID on the dashboard's right sidebar. Create an API token (My
Profile → API Tokens → Create Token) with the **Stream: Edit** permission.
For `CLOUDFLARE_STREAM_CUSTOMER_CODE`, open any existing Stream video's
preview/embed code — the URL looks like
`https://customer-XXXXXXXX.cloudflarestream.com/<uid>/iframe`; the
`customer-XXXXXXXX` part is your code. (If you have no videos yet, upload
one test file through the dashboard first just to see this code.)

### 4. Deploy to Vercel

Push this `backend-api` folder to its own GitHub repo (separate from the
static site's repo), then import it in Vercel. In Project Settings →
Environment Variables, add every variable listed in `.env.example` with
your real values. Deploy. Vercel installs dependencies and builds
automatically — you don't need to run `npm install` yourself unless you
want to test locally first with `npm run dev`.

Set `ALLOWED_ORIGIN` to your actual static site's origin(s), comma-separated
(e.g. `https://yourname.github.io,https://everyblockhasastory.com`) once you
know them — `*` works for initial testing but allows any site to call your
API.

## API reference

All request/response bodies are JSON. Base URL is wherever Vercel deploys
this to, e.g. `https://your-api.vercel.app`.

### `POST /api/auth/signup`
Body: `{ email, password, name? }`
→ `{ user, session: { access_token, refresh_token, expires_at }, message }`

### `POST /api/auth/login`
Body: `{ email, password }`
→ `{ user, session: { access_token, refresh_token, expires_at } }`

### `POST /api/auth/refresh`
Body: `{ refresh_token }`
→ `{ session: { access_token, refresh_token, expires_at } }`

### `POST /api/auth/logout`
No body needed — stateless; just discard the tokens client-side.
→ `{ message }`

### `GET /api/auth/session`
Header: `Authorization: Bearer <access_token>`
→ `{ user, profile: { name, shopify_verified } }`

### `POST /api/shopify/verify-purchase`
Header: `Authorization: Bearer <access_token>`
Body: `{ orderNumber }` (e.g. `"1001"` or `"#1001"` — must match the order
placed with the same email as the logged-in account)
→ `{ verified: true }` or `{ verified: false, reason }`

### `POST /api/videos/upload-url`
Header: `Authorization: Bearer <access_token>` (must be `shopify_verified`)
Body (optional): `{ maxDurationSeconds?, title? }`
→ `{ uploadURL, uid }`

Then, from the browser, upload the file directly:
```js
const form = new FormData();
form.append("file", videoFile);
await fetch(uploadURL, { method: "POST", body: form });
```

### `POST /api/videos`
Header: `Authorization: Bearer <access_token>` (must be `shopify_verified`)
Body: `{ cloudflareUid, title, caption?, location, country?, author? }`
→ `{ video, message }` (saved as `status: "pending"`)

### `GET /api/videos`
Public, no auth. Returns only approved videos.
→ `{ videos: [{ id, title, caption, location, country, author, cloudflare_uid, created_at, iframeUrl, thumbnailUrl }] }`

### `PATCH /api/videos/:id/approve` (optional)
Header: `x-admin-key: <ADMIN_API_KEY>`
Body (optional): `{ status: "approved" | "rejected" | "pending" }` (default `"approved"`)
→ `{ video }`

## Wiring it into the existing static site

Rough shape of the flow from `share.html`'s JS, once you're ready to
replace the current localStorage-only version:

```js
const API_BASE = "https://your-api.vercel.app";

// 1. Sign up or log in — store the token
const { session } = await fetch(`${API_BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
}).then((r) => r.json());
localStorage.setItem("ebs_access_token", session.access_token);
localStorage.setItem("ebs_refresh_token", session.refresh_token);

// 2. Verify their shirt order
await fetch(`${API_BASE}/api/shopify/verify-purchase`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({ orderNumber }),
});

// 3. Get an upload URL, then upload the file straight to Cloudflare
const { uploadURL, uid } = await fetch(`${API_BASE}/api/videos/upload-url`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({ title }),
}).then((r) => r.json());

const form = new FormData();
form.append("file", videoFile);
await fetch(uploadURL, { method: "POST", body: form });

// 4. Save the metadata
await fetch(`${API_BASE}/api/videos`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({ cloudflareUid: uid, title, caption, location, country, author }),
});

// 5. Anywhere on the site — list approved videos
const { videos } = await fetch(`${API_BASE}/api/videos`).then((r) => r.json());
```

I haven't rewired `script.js` itself yet — this README just shows the
shape. Say the word and I'll do that wiring next.

## A note on testing

This sandbox can't reach the npm registry, so I wasn't able to run
`npm install` / `next build` here to test this end-to-end the way I did
with the earlier zero-dependency Node server. I've reviewed every file
carefully and checked plain syntax where I could, but please run `npm
install && npm run dev` locally (or just deploy to Vercel, which will fail
the build loudly if anything's actually broken) before trusting this in
production.
