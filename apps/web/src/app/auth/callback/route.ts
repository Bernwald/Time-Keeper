import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/db/supabase-server";

/**
 * OTP / Magic-Link callback.
 * Supabase redirects here with ?code=<otp_code>&next=<optional-path>.
 * We exchange the code for a session (cookies get set by createUserClient)
 * and redirect into the app.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createUserClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const redirect = new URL("/auth/anmelden", url);
      redirect.searchParams.set("error", "link_invalid");
      return NextResponse.redirect(redirect);
    }
  }

  return NextResponse.redirect(new URL(next, url));
}
