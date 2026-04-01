import { createClient } from "@supabase/supabase-js";

import { hasSupabaseEnv } from "@/lib/db/env";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = ReturnType<typeof createClient<any>>;

export function getServiceSupabase(): { client: ServiceClient | null; error: string | null } {
  if (!hasSupabaseEnv()) {
    return { client: null, error: "Supabase-Umgebungsvariablen fehlen." };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  try {
    const client = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    return { client, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to initialize Supabase service client:", message);
    return { client: null, error: `Supabase-Client konnte nicht initialisiert werden: ${message}` };
  }
}
