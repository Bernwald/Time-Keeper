"use server";

import { listCompanies } from "@/lib/db/queries/companies";
import { listContacts } from "@/lib/db/queries/contacts";
import { listProjects } from "@/lib/db/queries/projects";

export async function getEntitiesForLinking(
  type: string,
): Promise<{ id: string; name: string }[]> {
  if (type === "company") {
    const list = await listCompanies();
    return list.map((c) => ({ id: c.id, name: c.name }));
  }
  if (type === "contact") {
    const list = await listContacts();
    return list.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}` }));
  }
  if (type === "project") {
    const list = await listProjects();
    return list.map((p) => ({ id: p.id, name: p.name }));
  }
  return [];
}
