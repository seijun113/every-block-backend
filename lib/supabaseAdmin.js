import { createClient } from "@supabase/supabase-js";

// Service-role client — full database access, bypasses Row Level Security.
// Import this ONLY in server-side code (route handlers, lib files that are
// themselves only used by route handlers). Never expose this key to a
// browser bundle.
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
  );
}

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
