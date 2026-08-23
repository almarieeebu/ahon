import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser (client component) Supabase client.
 * Gamiton sa React components nga naay "use client".
 *
 * Kung walay env vars, mobalik null — app magpadayon sa localStorage.
 *
 * Supabase dashboard usahay naggamit og "anon key", usahay "publishable key"
 * — pareho ra ni (JWT para sa browser). Support both env names.
 */
function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

function supabaseAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    undefined
  );
}

export function createClient() {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}
