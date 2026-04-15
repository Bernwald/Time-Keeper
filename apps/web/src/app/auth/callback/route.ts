import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * OTP / Magic-Link callback.
 *
 * Supabase redirects here with ?code=<otp_code>&next=<optional-path>.
 * We exchange the PKCE code for a session and write the session cookies
 * directly to the outgoing redirect response. Writing via next/headers
 * `cookies().set()` does NOT propagate to `NextResponse.redirect()` — the
 * session would never reach the browser and the user would bounce back to
 * /auth/anmelden after the redirect.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL("/auth/anmelden?error=missing_code", url));
  }

  const response = NextResponse.redirect(new URL(next, url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // NextRequest.cookies.getAll() returns already-decoded name/value pairs.
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const redirect = new URL("/auth/anmelden", url);
    redirect.searchParams.set("error", "link_invalid");
    redirect.searchParams.set("reason", error.message);
    return NextResponse.redirect(redirect);
  }

  return response;
}
