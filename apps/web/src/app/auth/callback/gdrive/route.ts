import { NextResponse } from "next/server";
import { saveGdriveTokens } from "@/app/quellen/actions";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(new URL(`/quellen?error=${error}`, req.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/quellen?error=missing_code", req.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback/gdrive`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/quellen?error=misconfigured", req.url));
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    console.error("[gdrive callback] token exchange:", tokenRes.status, txt);
    return NextResponse.redirect(new URL("/quellen?error=token_exchange", req.url));
  }

  const data = await tokenRes.json();
  if (!data.refresh_token) {
    return NextResponse.redirect(new URL("/quellen?error=no_refresh_token", req.url));
  }

  await saveGdriveTokens({
    refresh_token: data.refresh_token,
    access_token: data.access_token,
    expires_in: data.expires_in ?? 3600,
  });

  return NextResponse.redirect(new URL("/quellen?connected=gdrive", req.url));
}
