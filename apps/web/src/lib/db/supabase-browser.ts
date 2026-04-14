import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Browser client for client components (login forms, auth state listener).
 * Uses ANON key — respects RLS.
 *
 * Fails loudly when env vars are missing: on Vercel Preview deployments
 * NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY must be set for the "Preview"
 * environment separately from "Production". Without a readable error, login
 * just silently hangs.
 */
export function createBrowserSupabaseClient() {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase-Umgebungsvariablen fehlen. In Vercel → Settings → Environment Variables " +
        "müssen NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY auch für das " +
        "'Preview'-Environment gesetzt sein.",
    );
  }
  return createBrowserClient(url, anonKey);
}
