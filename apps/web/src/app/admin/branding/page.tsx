import { redirect } from "next/navigation";
import { createUserClient, getUser } from "@/lib/db/supabase-server";
import { requireOrgId } from "@/lib/db/org-context";
import BrandingForm from "./form";

export const dynamic = "force-dynamic";

export type BrandingState = {
  logo_url?: string;
  logo_dark_url?: string;
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    bg?: string;
    text?: string;
  };
  fonts?: { heading?: string; body?: string };
  tone_of_voice?: string;
  do_and_dont?: string[];
  templates?: { pptx_url?: string; html_skeleton_url?: string };
};

export default async function BrandingPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data } = await db
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .single();

  const branding = ((data?.settings as Record<string, unknown> | null)
    ?.branding ?? {}) as BrandingState;

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6 lg:p-8 max-w-3xl">
      <div>
        <h1
          className="text-xl md:text-2xl font-semibold"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--color-text)",
          }}
        >
          Brand Guidelines
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          Logo, Farben, Schriften und Tonalitaet. Wird vom Brand-Agent
          (Briefing-Generator) und vom Chat verwendet.
        </p>
      </div>
      <BrandingForm initial={branding} />
    </div>
  );
}
