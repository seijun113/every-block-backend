import { createClient } from "@supabase/supabase-js";

// Anon-key client — used only for auth operations (signUp, signInWithPassword,
// refreshSession, getUser). Routing auth through Supabase's own anon-key flow
// (rather than the service-role key) means Supabase's own rate limiting,
// email confirmation, and password rules still apply normally.
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables."
  );
}

export const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
