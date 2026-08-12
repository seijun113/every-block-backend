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

-- Row Level Security: every API route in this project uses the Supabase
-- service-role key (which bypasses RLS) for reads/writes, so these policies
-- are a defense-in-depth layer, not something the app currently relies on.
-- They matter if you ever add direct client-side Supabase access later.
alter table profiles enable row level security;
alter table videos enable row level security;

create policy "Users can read their own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Anyone can read approved videos"
  on videos for select
  using (status = 'approved');

create policy "Users can read their own videos"
  on videos for select
  using (auth.uid() = profile_id);
