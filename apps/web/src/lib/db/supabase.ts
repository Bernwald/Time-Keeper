import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const DEFAULT_ORG_ID = "11111111-1111-1111-1111-111111111111";

export function createServiceClient() {
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
