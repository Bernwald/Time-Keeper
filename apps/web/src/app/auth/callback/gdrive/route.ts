import { NextResponse } from "next/server";
import { saveGdriveTokens, triggerInitialSync } from "@/app/quellen/actions";
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

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${await getAppUrl()}/auth/callback/gdrive`;

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

  try {
    await saveGdriveTokens({
      refresh_token: data.refresh_token,
      access_token: data.access_token,
      expires_in: data.expires_in ?? 3600,
    });
  } catch (e) {
    console.error("[gdrive callback] save failed:", e);
    const msg = encodeURIComponent((e as Error).message ?? "save_failed");
    return NextResponse.redirect(new URL(`/quellen?error=save:${msg}`, req.url));
  }

  // Initial-Sync direkt nach OAuth-Connect anstoßen — sonst muss der User
  // manuell auf "Jetzt synchronisieren" klicken und sieht bis dahin die
  // Stale-Warnung. triggerInitialSync redirected selbst auf /admin/integrationen
  // mit Erfolg- bzw. Fehler-Query-Param.
  try {
    await triggerInitialSync("google_drive");
  } catch (e) {
    // triggerInitialSync redirected immer — wenn wir hier landen, dann nur
    // weil Next.js den Redirect als Exception wirft. Das ist erwünscht.
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    console.error("[gdrive callback] initial-sync failed:", e);
    return NextResponse.redirect(new URL("/admin/integrationen?connected=gdrive&sync_error=1", req.url));
  }
  // Unreachable — triggerInitialSync redirects in allen Fällen.
  return NextResponse.redirect(new URL("/admin/integrationen?connected=gdrive", req.url));
}
