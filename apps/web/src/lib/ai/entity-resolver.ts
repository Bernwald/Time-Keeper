import { listCompanies } from "@/lib/db/queries/companies";
import { listContacts } from "@/lib/db/queries/contacts";
import { listProjects } from "@/lib/db/queries/projects";
import { createUserClient } from "@/lib/db/supabase-server";
import { requireOrgId } from "@/lib/db/org-context";

export type ResolvedEntity = {
  type: "company" | "contact" | "project";
  id: string;
  name: string;
};

export async function resolveEntities(query: string): Promise<ResolvedEntity[]> {
  const lower = query.toLowerCase();
  const [companies, contacts, projects] = await Promise.all([
    listCompanies(),
    listContacts(),
    listProjects(),
  ]);

  const matches: ResolvedEntity[] = [];

  for (const c of companies) {
    if (lower.includes(c.name.toLowerCase())) {
      matches.push({ type: "company", id: c.id, name: c.name });
    }
  }

  for (const c of contacts) {
    const fullName = `${c.first_name} ${c.last_name}`;
    if (
      lower.includes(fullName.toLowerCase()) ||
      lower.includes(c.last_name.toLowerCase())
    ) {
      matches.push({ type: "contact", id: c.id, name: fullName });
    }
  }

  for (const p of projects) {
    if (lower.includes(p.name.toLowerCase())) {
      matches.push({ type: "project", id: p.id, name: p.name });
    }
  }

  return matches;
}

export async function getBoostSourceIds(entities: ResolvedEntity[]): Promise<string[]> {
  if (entities.length === 0) return [];

  const orgId = await requireOrgId();
  const db = await createUserClient();
  const sourceIds = new Set<string>();

  for (const entity of entities) {
    const { data } = await db
      .from("source_links")
      .select("source_id")
      .eq("organization_id", orgId)
      .eq("linked_type", entity.type)
      .eq("linked_id", entity.id);

    if (data) {
      for (const row of data) {
        sourceIds.add(row.source_id);
      }
    }
  }

  return [...sourceIds];
}
