import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

/**
 * OTP / Magic-Link callback.
 *
 * Supabase redirects here with ?code=<otp_code>&next=<optional-path>.
 * We need to exchange the code for a session and — critically — set the
 * session cookies on the redirect response itself. Using the shared
 * `createUserClient()` (which writes to next/headers `cookies()`) does NOT
 * propagate cookies to `NextResponse.redirect()` — the session would be
 * created server-side but never reach the browser, so the user bounces
 * straight back to /auth/anmelden.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL("/auth/anmelden", url));
  }

  const response = NextResponse.redirect(new URL(next, url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers.get("cookie")
            ? parseCookieHeader(request.headers.get("cookie")!)
            : [];
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
    return NextResponse.redirect(redirect);
  }

  return response;
}

function parseCookieHeader(header: string): { name: string; value: string }[] {
  return header.split(";").map((pair) => {
    const [name, ...rest] = pair.trim().split("=");
    return { name, value: rest.join("=") };
  });
}
