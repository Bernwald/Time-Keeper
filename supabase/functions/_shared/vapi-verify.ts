// Verify Vapi webhook authentication via the shared serverUrlSecret.
//
// Vapi sends the configured `serverUrlSecret` as a plaintext header
// (`x-vapi-secret`, with `x-vapi-signature` as a legacy fallback).
// We compare it against VAPI_SECRET using a constant-time comparison.

export async function verifyVapiSignature(
  _body: string,
  headerValue: string | null,
): Promise<boolean> {
  const secret = Deno.env.get("VAPI_SECRET");

  // If no secret configured, skip verification (dev mode)
  if (!secret) {
    console.warn("VAPI_SECRET not set — skipping webhook verification");
    return true;
  }

  if (!headerValue) {
    console.error("[vapi-verify] Missing Vapi secret header");
    return false;
  }

  const match = timingSafeEqual(headerValue, secret);
  if (!match) {
    console.error("[vapi-verify] Secret header mismatch");
  }
  return match;
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
