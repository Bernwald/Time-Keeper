// Resolve the base URL of the currently running deployment.
//
// Why this exists:
//   On Vercel Preview deployments the URL changes per branch (e.g.
//   time-keeper-git-feature-xxx.vercel.app). If OAuth redirect_uris are built
//   from a hardcoded NEXT_PUBLIC_APP_URL pointing at production, the OAuth
//   provider redirects the user back to production after consent and the
//   preview never receives the code → login loop.
//
// Precedence:
//   1. NEXT_PUBLIC_APP_URL — explicit override, highest priority. Useful for
//      custom domains or when you want previews to redirect to prod.
//   2. VERCEL_URL — auto-injected by Vercel on every deploy (preview + prod),
//      no protocol. We prefix https://.
//   3. localhost fallback for `next dev`.
//
// Important: every OAuth provider (Google, Microsoft) requires the
// redirect_uri to be whitelisted. For preview deployments to work you must
// add a wildcard / pattern in the provider's console, e.g.
//   https://time-keeper-*-bernwald.vercel.app/auth/callback/gdrive
// Google doesn't support wildcards — use a stable preview alias domain in
// Vercel ("Git: feature branch" → assign alias like preview.time-keeper.io).

export function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit && explicit.length > 0) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL;
  if (vercel && vercel.length > 0) return `https://${vercel}`;

  return "http://localhost:3000";
}
