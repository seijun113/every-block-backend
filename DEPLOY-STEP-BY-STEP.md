# Deploying your backend — a complete beginner's walkthrough

This will take you through everything, in order, using only your web browser
(no commands to type, except one copy-paste into a website's text box).
You'll end up with a working backend at a web address like
`https://every-block-backend.vercel.app`.

A few words explained up front, since they'll come up:

- **Repo** ("repository") — a folder of code stored on GitHub.
- **Account / project** — most of these services need you to sign up (free) and then create a "project" inside your account for this specific backend.
- **Environment variable** — a secret setting (like a password) that you type into a website's settings screen instead of writing into the code itself. This keeps secrets safe.
- **Deploy** — the act of taking your code and making it live on the internet.

You'll be using four websites total: **GitHub**, **Supabase**, **Cloudflare**,
**Shopify** (you likely already have this one), and **Vercel**. Do them in
this order, since some steps need information from an earlier one.

---

## Phase 1 — Put the code on GitHub

1. Go to [github.com](https://github.com). If you don't have an account, click **Sign up** and create one (it's free).
2. Once logged in, click the **+** icon in the top-right corner, then **New repository**.
3. Name it something like `every-block-backend`. Leave it set to **Public**. Do NOT check any of the boxes for adding a README or .gitignore. Click **Create repository**.
4. You'll land on an empty repo page. Look for a link that says **uploading an existing file** (it's in the text on that page) and click it.
5. Now open the `backend-api` folder I gave you on your computer. Select **everything inside it** (all the files and folders — `app`, `lib`, `package.json`, `middleware.js`, everything) and drag them all into the upload box on the GitHub page.
   - Important: drag the *contents* of the `backend-api` folder in, not the `backend-api` folder itself. When you're done, GitHub's file list should show `app`, `lib`, `package.json`, etc. directly — not a single folder called `backend-api` containing all of that.
6. Scroll down and click the green **Commit changes** button. Wait for the upload to finish.

You now have the code on GitHub. Leave this tab open or come back to it later — you won't need to touch it again for now.

---

## Phase 2 — Set up your database (Supabase)

This is where your app will store user accounts and video info.

1. Go to [supabase.com](https://supabase.com) and click **Start your project**. Sign up (you can use your GitHub account to sign up faster — click "Continue with GitHub").
2. Click **New project**. Give it a name like `every-block`. Set a database password (click the dice icon to auto-generate one, then click the little copy icon and paste it somewhere safe, like a notes app — you likely won't need it again, but keep it just in case). Pick any region close to you. Click **Create new project**. Wait a minute or two while it sets itself up.
3. Once it's ready, look at the left sidebar and click the icon that looks like a terminal/code symbol labeled **SQL Editor**.
4. Click **New query**.
5. Open the file called `schema.sql` (it's in the same `backend-api` folder). Select all the text in it, copy it, and paste it into the box on the Supabase page.
6. Click the green **Run** button (or press Ctrl+Enter / Cmd+Enter). You should see a success message. This just created the two "tables" (like spreadsheets) your app needs — one for user profiles, one for videos.
7. Now click the gear/settings icon in the left sidebar, then **API** (or it may be labeled **Project Settings → API**).
8. You'll see three things you need to save somewhere (a notes app, a text file — anywhere you can copy from later):
   - **Project URL** — looks like `https://xxxxx.supabase.co`
   - **anon public** key — a long string of letters and numbers
   - **service_role** key — another long string (this one's further down, sometimes needs a click to reveal — treat it like a password, don't share it)

Keep this tab open too, or make sure you saved those three values.

---

## Phase 3 — Get your Shopify key

You already have a Shopify store (`everybodyhasastory.myshopify.com`), so:

1. Go to your Shopify admin (log in at shopify.com if needed).
2. In the left sidebar, click **Settings** (usually at the very bottom), then **Apps and sales channels**.
3. Click **Develop apps** (near the top — if you don't see this option, click **allow custom app development** first, then it'll appear).
4. Click **Create an app**. Name it something like `Backend API`. Click **Create app**.
5. Click **Configure Admin API scopes**. In the search box, type `read_orders` and check the box next to it. Scroll down and click **Save**.
6. Click the **API credentials** tab, then click **Install app** (confirm if asked).
7. After installing, you'll see an **Admin API access token** — click **Reveal token once**, and copy it immediately (Shopify only shows it to you one time). Save it with your other collected values. It starts with `shpat_`.

You already have two other Shopify values (I'll remind you where to put them later):
- Store domain: `everybodyhasastory.myshopify.com`
- Product ID: `10564552130879`

---

## Phase 4 — Set up video hosting (Cloudflare Stream)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) and sign up / log in.
2. In the left sidebar, find and click **Stream**. If it asks you to enable/start a plan for Stream, do that (it has a monthly cost based on usage — Cloudflare will show you the pricing before you confirm).
3. Once you're in the Stream section, look at the browser's address bar or the dashboard's right-hand panel for your **Account ID** — it's a long string of letters/numbers. Copy and save it. (If you don't see it on the Stream page, click your account name / the home icon to go to the main dashboard — the Account ID is usually shown on the right side of the overview page.)
4. Upload any one test video through the Stream dashboard (click **Upload video**, pick any short clip) — you need this so you can see a working video URL in the next step. This test video isn't important; it's just to get a sample link.
5. Click on that uploaded video once it's ready, and find its **preview** or **embed code**. Look for a web address inside it that looks like:
   `https://customer-ABC123XYZ.cloudflarestream.com/.../iframe`
   Copy just the `ABC123XYZ` part (the bit right after "customer-" and before ".cloudflarestream.com"). Save it — this is your **customer code**.
6. Now click your account icon (top right) → **My Profile** → **API Tokens** tab.
7. Click **Create Token**, then find **Create Custom Token** (or similar wording — you want a *custom* token, not one of the pre-made templates) and click **Get started** / **Continue**.
8. Give it a name like `stream-backend`. Under permissions, set it to **Stream** → **Edit**. Leave other settings as default. Click **Continue to summary**, then **Create Token**.
9. Copy the token shown (it's shown once) and save it.

You should now have: Account ID, a Stream API token, and a customer code.

---

## Phase 5 — Deploy everything to Vercel

This is the final step — it takes your code from GitHub and makes it live on the internet, using all the secret values you've collected.

1. Go to [vercel.com](https://vercel.com) and sign up — click **Continue with GitHub** so it connects to your GitHub account automatically.
2. Click **Add New...** (top right) → **Project**.
3. You'll see a list of your GitHub repos — find `every-block-backend` (the one from Phase 1) and click **Import** next to it.
4. Before clicking deploy, look for a section called **Environment Variables** on this same screen (you may need to click to expand it). This is where you paste in every secret value you collected. Add each one as a separate row — on the left is the **name** (type it exactly as shown below, in capital letters), on the right is the **value** (paste what you saved):

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL from Supabase |
   | `SUPABASE_ANON_KEY` | your anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service_role key |
   | `SHOPIFY_STORE_DOMAIN` | `everybodyhasastory.myshopify.com` |
   | `SHOPIFY_ADMIN_API_TOKEN` | your Shopify token (starts with `shpat_`) |
   | `SHOPIFY_API_VERSION` | `2024-10` |
   | `SHOPIFY_PRODUCT_ID` | `10564552130879` |
   | `CLOUDFLARE_ACCOUNT_ID` | your Cloudflare Account ID |
   | `CLOUDFLARE_STREAM_API_TOKEN` | your Cloudflare Stream token |
   | `CLOUDFLARE_STREAM_CUSTOMER_CODE` | your customer code from Phase 4 |
   | `ALLOWED_ORIGIN` | `*` (you can tighten this later) |
   | `ADMIN_API_KEY` | make up any long random password-like string yourself |

5. Once every row is filled in, click the big **Deploy** button.
6. Wait a minute or two while it builds. You'll see a progress screen, then either a "Congratulations" screen with confetti (success!) or an error log (see the troubleshooting note below).
7. On the success screen, you'll see your live web address, something like `https://every-block-backend.vercel.app`. That's your backend's home. Save that address too.

---

## Phase 6 — Check it actually works

You don't need any special tools for this — just your browser.

1. Visit your Vercel address directly (e.g. `https://every-block-backend.vercel.app`). You should see a simple page that says "Every Block Has a Story — API". That confirms the site itself is live.
2. To test a real endpoint, visit `https://every-block-backend.vercel.app/api/videos` (add `/api/videos` to the end). You should see something like `{"videos":[]}` — plain text, no styling. That's correct! It means the backend successfully talked to your Supabase database and found zero videos so far (since none have been approved yet).

If either of those doesn't work, go back to Vercel, click into your project, click the **Deployments** tab, click the most recent one, and look at the build log for red error text — it will usually tell you which environment variable is missing or misspelled.

---

## What's left after this

This makes the backend live, but your actual website (the HTML pages) isn't
calling it yet — it still uses the old browser-only system. That's a
separate step (updating `script.js` to talk to this new address instead).
Just let me know when you're ready for that and I'll wire it up using the
address from Phase 5.
