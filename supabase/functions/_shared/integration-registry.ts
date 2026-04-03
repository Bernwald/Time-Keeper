// Integration Registry — resolve credentials per org from the registry,
// falling back to global env vars when credential_mode is 'platform'.

import { getServiceClient } from "./supabase.ts";

type IntegrationRow = {
  status: string;
  credential_mode: string;
  credentials: Record<string, string>;
  config: Record<string, unknown>;
  error_message: string | null;
};

/**
 * Get the integration row for an org + provider.
 * Returns null if no row exists or status is not 'active'.
 */
export async function getOrgIntegration(
  orgId: string,
  providerId: string,
): Promise<IntegrationRow | null> {
  const db = getServiceClient();
  const { data } = await db.rpc("get_org_integration", {
    p_org_id: orgId,
    p_provider_id: providerId,
  });

  if (!data || data.length === 0) return null;
  return data[0] as IntegrationRow;
}

/**
 * Resolve the VAPI API key for an org.
 * If the org has credential_mode='customer' with their own key, use that.
 * Otherwise fall back to the global VAPI_API_KEY env var.
 */
export async function getVapiKeyForOrg(orgId: string): Promise<string> {
  const integration = await getOrgIntegration(orgId, "vapi");

  if (
    integration?.credential_mode === "customer" &&
    integration.credentials?.api_key
  ) {
    return integration.credentials.api_key;
  }

  const key = Deno.env.get("VAPI_API_KEY");
  if (!key) throw new Error("VAPI_API_KEY not set");
  return key;
}

/**
 * Resolve Google OAuth client credentials for an org.
 * If the org has credential_mode='customer', use their client ID/secret.
 * Otherwise fall back to global env vars.
 */
export async function getGoogleCredsForOrg(
  orgId: string,
): Promise<{ clientId: string; clientSecret: string }> {
  const integration = await getOrgIntegration(orgId, "google_calendar");

  if (
    integration?.credential_mode === "customer" &&
    integration.credentials?.client_id &&
    integration.credentials?.client_secret
  ) {
    return {
      clientId: integration.credentials.client_id,
      clientSecret: integration.credentials.client_secret,
    };
  }

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set");
  }
  return { clientId, clientSecret };
}
