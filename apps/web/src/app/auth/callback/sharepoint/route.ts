import { NextResponse } from "next/server";
import { saveSharepointTokens } from "@/app/quellen/actions";
import { getAppUrl } from "@/lib/app-url";

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

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";
  const redirectUri = `${getAppUrl()}/auth/callback/sharepoint`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/quellen?error=misconfigured", req.url));
  }

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        scope: "offline_access Files.ReadWrite.All Sites.ReadWrite.All",
      }),
    },
  );

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    console.error("[sharepoint callback] token exchange:", tokenRes.status, txt);
    return NextResponse.redirect(new URL("/quellen?error=token_exchange", req.url));
  }

  const data = await tokenRes.json();
  if (!data.refresh_token) {
    return NextResponse.redirect(new URL("/quellen?error=no_refresh_token", req.url));
  }

  try {
    await saveSharepointTokens({
      refresh_token: data.refresh_token,
      access_token: data.access_token,
      expires_in: data.expires_in ?? 3600,
    });
  } catch (e) {
    console.error("[sharepoint callback] save failed:", e);
    const msg = encodeURIComponent((e as Error).message ?? "save_failed");
    return NextResponse.redirect(new URL(`/quellen?error=save:${msg}`, req.url));
  }

  return NextResponse.redirect(new URL("/quellen?connected=sharepoint", req.url));
}
