import { demoCompanies } from "@/features/platform/demo-data";
import { getDefaultOrganizationSlug, hasSupabaseEnv } from "@/lib/db/env";
import { getServiceSupabase } from "@/lib/db/server";
import { OrganizationContext } from "@/lib/domain/types";

const demoOrganization: OrganizationContext = {
  id: demoCompanies[0].organization_id,
  slug: "time-keeper",
  name: "Time Keeper"
};

export async function getOrganizationContext(): Promise<OrganizationContext> {
  if (!hasSupabaseEnv()) {
    return demoOrganization;
  }

  try {
    const result = getServiceSupabase();

    if (!result.client) {
      return demoOrganization;
    }

    const slug = getDefaultOrganizationSlug();
    const { data, error } = await result.client
      .from("organizations")
      .select("id, slug, name")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error(`Failed to load organization context for slug "${slug}": ${error.message}`);
      return demoOrganization;
    }

    if (!data) {
      console.error(
        `No organization found for DEFAULT_ORGANIZATION_SLUG="${slug}". Falling back to demo organization.`
      );
      return demoOrganization;
    }

    return data;
  } catch (error) {
    console.error("Unexpected error while loading organization context. Falling back to demo organization.", error);
    return demoOrganization;
  }
}
