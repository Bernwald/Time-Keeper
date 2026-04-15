import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { pathname, searchParams } = request.nextUrl;

  // Magic-Link safety net: Supabase sometimes redirects with `?code=...` to
  // the bare Site URL (e.g. `/?code=xxx`) instead of `/auth/callback?code=xxx`,
  // depending on the Additional Redirect URLs config. Forward any `?code=`
  // arriving outside the callback route to the handler so the session can be
  // exchanged — otherwise the user lands on `/`, middleware sees no session
  // yet, and bounces them to /auth/anmelden.
  const hasOtpCode = searchParams.has("code");
  const isCallbackPath =
    pathname === "/auth/callback" || pathname.startsWith("/auth/callback/");
  if (hasOtpCode && !isCallbackPath) {
    const target = request.nextUrl.clone();
    target.pathname = "/auth/callback";
    // Preserve original destination as `next` so the callback can return users
    // to where the deep-link pointed.
    if (!searchParams.has("next") && pathname !== "/") {
      target.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(target);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isDedicated = process.env.INSTANCE_MODE === "dedicated";

  // OAuth callback routes must always pass through, regardless of auth state
  const isOAuthCallback = pathname.startsWith("/auth/callback/");

  // Logout route must always pass through — otherwise middleware redirects the
  // POST to `/` before the handler can clear the session cookie.
  const isLogout = pathname === "/auth/abmelden";

  // Not authenticated → redirect to login (except auth pages)
  if (!user && !pathname.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/anmelden";
    return NextResponse.redirect(url);
  }

  // Authenticated but on auth pages → redirect to home (but never on OAuth
  // callbacks or the logout handler).
  if (user && pathname.startsWith("/auth") && !isOAuthCallback && !isLogout) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Dedicated mode: block admin and onboarding routes
  if (isDedicated && (pathname.startsWith("/admin") || pathname.startsWith("/onboarding"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
