// Verify Vapi webhook signatures using HMAC-SHA256

export async function verifyVapiSignature(
  body: string,
  signature: string | null,
): Promise<boolean> {
  const secret = Deno.env.get("VAPI_SECRET");

  // If no secret configured, skip verification (dev mode)
  if (!secret) {
    console.warn("VAPI_SECRET not set — skipping webhook signature verification");
    return true;
  }

  if (!signature) {
    console.error("Missing Vapi signature header");
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computed === signature;
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}
