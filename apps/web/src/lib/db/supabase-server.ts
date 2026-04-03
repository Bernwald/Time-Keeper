import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * User-scoped client (ANON key + cookies). Respects RLS.
 * Wrapped with React cache() — deduplicated per request.
 */
export const createUserClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from Server Component — ignore
        }
      },
    },
  });
});

/**
 * Service-role client. Bypasses RLS.
 * Use only for admin operations: chunking, embeddings, onboarding, admin panel.
 */
export function createServiceClient() {
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

/**
 * Get the current authenticated user (validated against Supabase Auth).
 * Wrapped with React cache() — no matter how many components call this,
 * the actual Supabase auth check happens only ONCE per request.
 */
export const getUser = cache(async () => {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Get the current session from cookies — no network call.
 * Use when you only need to check IF a user is logged in
 * (e.g. layout shell decision). Middleware already validated the session.
 */
export const getSession = cache(async () => {
  const supabase = await createUserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
});
