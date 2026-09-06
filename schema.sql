-- Run this in your Supabase project's SQL editor (Database -> SQL Editor)
-- before deploying. Safe to re-run (uses IF NOT EXISTS throughout).

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  shopify_verified boolean not null default false,
  shopify_order_id text,
  created_at timestamptz not null default now()
);

create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  cloudflare_uid text not null,
  title text not null,
  caption text,
  location text not null,
  country text,
  author text default 'Anonymous',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists videos_status_idx on videos (status, created_at desc);

-- Stores Shopify orders confirmed (via webhook) to contain the Every Block
-- Tee, keyed by the lowercased email that placed the order. Populated
-- automatically the instant an order is paid -- before any account may
-- even exist yet. When someone signs up (or logs in) with a matching
-- email, the app marks their profile shopify_verified without them typing
-- an order number.
create table if not exists verified_purchases (
  email text primary key,
  shopify_order_id text not null,
  shopify_order_name text,
  created_at timestamptz not null default now()
);

-- Row Level Security: every API route in this project uses the Supabase
-- service-role key (which bypasses RLS) for reads/writes, so these policies
-- are a defense-in-depth layer, not something the app currently relies on.
-- They matter if you ever add direct client-side Supabase access later.
alter table profiles enable row level security;
alter table videos enable row level security;
-- No select/insert/update policies here on purpose: this table is only
-- ever touched by the service-role key from server-side webhook/signup
-- code, never by a logged-in user's own client.
alter table verified_purchases enable row level security;

create policy "Users can read their own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Anyone can read approved videos"
  on videos for select
  using (status = 'approved');

create policy "Users can read their own videos"
  on videos for select
  using (auth.uid() = profile_id);
