import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser client for client components (login forms, auth state listener).
 * Uses ANON key — respects RLS.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(url, anonKey);
}
