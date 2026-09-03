import { createClient } from "@supabase/supabase-js";

// Falls back to a placeholder so the build (CI, or a Vercel preview without
// env vars configured yet) doesn't crash at module-evaluation time — Next
// evaluates client-component modules during static prerendering. Real pages
// always run in the browser with the real env vars injected at build time.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
