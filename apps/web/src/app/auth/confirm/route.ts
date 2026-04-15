import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Robust magic-link / invite / signup confirm handler.
 *
 * Uses `verifyOtp({ type, token_hash })` instead of the PKCE
 * `exchangeCodeForSession(code)` flow. Unlike PKCE, this does NOT rely on a
 * client-side `code_verifier` cookie, so the link works across devices,
 * browsers and private tabs (e.g. email client opens link in external browser).
 *
 * Session cookies are written directly to the outgoing redirect response —
 * setting them via next/headers `cookies()` does not propagate to
 * `NextResponse.redirect()`.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/";

  const loginRedirect = (reason: string) => {
    const redirect = new URL("/auth/anmelden", url);
    redirect.searchParams.set("error", "link_invalid");
    redirect.searchParams.set("reason", reason);
    return NextResponse.redirect(redirect);
  };

  if (!token_hash || !type) {
    return loginRedirect("missing_token");
  }

  const response = NextResponse.redirect(new URL(next, url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    return loginRedirect(error.message);
  }

  return response;
}
