import { unstable_noStore as noStore } from "next/cache";

import { Company, Contact, ContentItem, ContentLink, DashboardData, Document, Interaction, Project, Source, Task } from "@/lib/domain/types";
import {
  demoCompanies,
  demoContacts,
  demoContentItems,
  demoDashboard,
  demoDocuments,
  demoInteractions,
  demoProjects,
  demoSources,
  demoTasks
} from "@/features/platform/demo-data";
import { getOrganizationContext } from "@/lib/db/organization";
import { getServiceSupabase } from "@/lib/db/server";

function sortByUpdatedDesc<T extends { updated_at: string }>(items: T[]) {
  return [...items].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

function logAndFallback<T>(scope: string, fallback: T, error: unknown) {
  console.error(`Repository fallback triggered in ${scope}.`, error);
  return fallback;
}

export async function getDashboardData(): Promise<DashboardData> {
  noStore();
  try {
    const { client: supabase } = getServiceSupabase();

    if (!supabase) {
      return demoDashboard;
    }

    const organization = await getOrganizationContext();

    const [tasks, interactions, projects, documents, companies, sources, contentItems] = await Promise.all([
      supabase.from("tasks").select("*").eq("organization_id", organization.id).order("due_date", { ascending: true }).limit(5),
      supabase.from("interactions").select("*").eq("organization_id", organization.id).order("occurred_at", { ascending: false }).limit(5),
      supabase.from("projects").select("*").eq("organization_id", organization.id).order("updated_at", { ascending: false }).limit(5),
      supabase.from("documents").select("*").eq("organization_id", organization.id).order("updated_at", { ascending: false }).limit(5),
      supabase.from("companies").select("*").eq("organization_id", organization.id).order("updated_at", { ascending: false }).limit(5),
      supabase.from("sources").select("*").eq("organization_id", organization.id).order("updated_at", { ascending: false }).limit(5),
      supabase.from("content_items").select("*").eq("organization_id", organization.id).order("updated_at", { ascending: false }).limit(5)
    ]);

    return {
      overdueTasks: (tasks.data as Task[]) || [],
      recentInteractions: (interactions.data as Interaction[]) || [],
      activeProjects: (projects.data as Project[]) || [],
      recentDocuments: (documents.data as Document[]) || [],
      companies: (companies.data as Company[]) || [],
      recentSources: (sources.data as Source[]) || [],
      recentContentItems: (contentItems.data as ContentItem[]) || []
    };
  } catch (error) {
    return logAndFallback("getDashboardData", demoDashboard, error);
  }
}

export async function listCompanies() {
  noStore();
  try {
    const { client: supabase } = getServiceSupabase();
    if (!supabase) return sortByUpdatedDesc(demoCompanies);
    const organization = await getOrganizationContext();
    const { data } = await supabase
      .from("companies")
      .select("*")
      .eq("organization_id", organization.id)
      .order("updated_at", { ascending: false });
    return (data as Company[]) || [];
  } catch (error) {
    return logAndFallback("listCompanies", sortByUpdatedDesc(demoCompanies), error);
  }
}

export async function listContacts() {
  noStore();
  try {
    const { client: supabase } = getServiceSupabase();
    if (!supabase) return sortByUpdatedDesc(demoContacts);
    const organization = await getOrganizationContext();
    const [contactsResult, companiesResult] = await Promise.all([
      supabase.from("contacts").select("*").eq("organization_id", organization.id).order("updated_at", { ascending: false }),
      supabase.from("companies").select("id, name").eq("organization_id", organization.id)
    ]);
    const companiesById = new Map((companiesResult.data || []).map((item) => [item.id, item.name]));
    return ((contactsResult.data as Contact[]) || []).map((contact) => ({
      ...contact,
      company_name: contact.company_id ? companiesById.get(contact.company_id) || null : null
    }));
  } catch (error) {
    return logAndFallback("listContacts", sortByUpdatedDesc(demoContacts), error);
  }
}

export async function listProjects() {
  noStore();
  try {
    const { client: supabase } = getServiceSupabase();
    if (!supabase) return sortByUpdatedDesc(demoProjects);
    const organization = await getOrganizationContext();
    const [projectsResult, companiesResult] = await Promise.all([
      supabase.from("projects").select("*").eq("organization_id", organization.id).order("updated_at", { ascending: false }),
      supabase.from("companies").select("id, name").eq("organization_id", organization.id)
    ]);
    const companiesById = new Map((companiesResult.data || []).map((item) => [item.id, item.name]));
    return ((projectsResult.data as Project[]) || []).map((project) => ({
      ...project,
      company_name: project.company_id ? companiesById.get(project.company_id) || null : null
    }));
  } catch (error) {
    return logAndFallback("listProjects", sortByUpdatedDesc(demoProjects), error);
  }
}

export async function listInteractions() {
  noStore();
  try {
    const { client: supabase } = getServiceSupabase();
    if (!supabase) return [...demoInteractions].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
    const organization = await getOrganizationContext();
    const [interactionsResult, companiesResult, contactsResult, projectsResult] = await Promise.all([
      supabase.from("interactions").select("*").eq("organization_id", organization.id).order("occurred_at", { ascending: false }),
      supabase.from("companies").select("id, name").eq("organization_id", organization.id),
      supabase.from("contacts").select("id, first_name, last_name").eq("organization_id", organization.id),
      supabase.from("projects").select("id, name").eq("organization_id", organization.id)
    ]);
    const companiesById = new Map((companiesResult.data || []).map((item) => [item.id, item.name]));
    const contactsById = new Map((contactsResult.data || []).map((item) => [item.id, `${item.first_name} ${item.last_name}`]));
    const projectsById = new Map((projectsResult.data || []).map((item) => [item.id, item.name]));

    return ((interactionsResult.data as Interaction[]) || []).map((interaction) => ({
      ...interaction,
      company_name: interaction.company_id ? companiesById.get(interaction.company_id) || null : null,
      contact_name: interaction.contact_id ? contactsById.get(interaction.contact_id) || null : null,
      project_name: interaction.project_id ? projectsById.get(interaction.project_id) || null : null
    }));
  } catch (error) {
    return logAndFallback("listInteractions", [...demoInteractions].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)), error);
  }
}

export async function listTasks() {
  noStore();
  try {
    const { client: supabase } = getServiceSupabase();
    if (!supabase) return sortByUpdatedDesc(demoTasks);
    const organization = await getOrganizationContext();
    const [tasksResult, companiesResult, contactsResult, projectsResult] = await Promise.all([
      supabase.from("tasks").select("*").eq("organization_id", organization.id).order("due_date", { ascending: true }),
      supabase.from("companies").select("id, name").eq("organization_id", organization.id),
      supabase.from("contacts").select("id, first_name, last_name").eq("organization_id", organization.id),
      supabase.from("projects").select("id, name").eq("organization_id", organization.id)
    ]);
    const companiesById = new Map((companiesResult.data || []).map((item) => [item.id, item.name]));
    const contactsById = new Map((contactsResult.data || []).map((item) => [item.id, `${item.first_name} ${item.last_name}`]));
    const projectsById = new Map((projectsResult.data || []).map((item) => [item.id, item.name]));

    return ((tasksResult.data as Task[]) || []).map((task) => ({
      ...task,
      company_name: task.company_id ? companiesById.get(task.company_id) || null : null,
      contact_name: task.contact_id ? contactsById.get(task.contact_id) || null : null,
      project_name: task.project_id ? projectsById.get(task.project_id) || null : null
    }));
  } catch (error) {
    return logAndFallback("listTasks", sortByUpdatedDesc(demoTasks), error);
  }
}

export async function listDocuments() {
  noStore();
  try {
    const { client: supabase } = getServiceSupabase();
    if (!supabase) return sortByUpdatedDesc(demoDocuments);
    const organization = await getOrganizationContext();
    const { data } = await supabase
      .from("documents")
      .select("*")
      .eq("organization_id", organization.id)
      .order("updated_at", { ascending: false });
    return (data as Document[]) || [];
  } catch (error) {
    return logAndFallback("listDocuments", sortByUpdatedDesc(demoDocuments), error);
  }
}

export async function listSources() {
  noStore();
  try {
    const { client: supabase } = getServiceSupabase();
    if (!supabase) return sortByUpdatedDesc(demoSources);
    const organization = await getOrganizationContext();
    const { data } = await supabase
      .from("sources")
      .select("*")
      .eq("organization_id", organization.id)
      .order("updated_at", { ascending: false });
    return (data as Source[]) || [];
  } catch (error) {
    return logAndFallback("listSources", sortByUpdatedDesc(demoSources), error);
  }
}

export async function listContentItems() {
  noStore();
  try {
    const { client: supabase } = getServiceSupabase();
    if (!supabase) return sortByUpdatedDesc(demoContentItems);
    const organization = await getOrganizationContext();
    const [contentResult, sourcesResult] = await Promise.all([
      supabase
        .from("content_items")
        .select("*")
        .eq("organization_id", organization.id)
        .order("updated_at", { ascending: false }),
      supabase.from("sources").select("id, title, source_name").eq("organization_id", organization.id)
    ]);
    const sourcesById = new Map(
      (sourcesResult.data || []).map((item) => [item.id, item.title || item.source_name])
    );
    return ((contentResult.data as ContentItem[]) || []).map((item) => ({
      ...item,
      source_title: item.source_id ? sourcesById.get(item.source_id) || null : null
    }));
  } catch (error) {
    return logAndFallback("listContentItems", sortByUpdatedDesc(demoContentItems), error);
  }
}

export async function getCompanyById(id: string) {
  return (await listCompanies()).find((item) => item.id === id) || null;
}

export async function getContactById(id: string) {
  return (await listContacts()).find((item) => item.id === id) || null;
}

export async function getProjectById(id: string) {
  return (await listProjects()).find((item) => item.id === id) || null;
}

export async function getInteractionById(id: string) {
  return (await listInteractions()).find((item) => item.id === id) || null;
}

export async function getTaskById(id: string) {
  return (await listTasks()).find((item) => item.id === id) || null;
}

export async function getDocumentById(id: string) {
  return (await listDocuments()).find((item) => item.id === id) || null;
}

export async function getSourceById(id: string) {
  return (await listSources()).find((item) => item.id === id) || null;
}

export async function getContentItemById(id: string) {
  return (await listContentItems()).find((item) => item.id === id) || null;
}

export async function updateRecord(
  table: string,
  id: string,
  values: Record<string, unknown>
): Promise<{ error?: string }> {
  const { client: supabase } = getServiceSupabase();
  if (!supabase) return { error: "Keine Datenbankverbindung." };
  const org = await getOrganizationContext();
  const { error } = await supabase
    .from(table)
    .update(values)
    .eq("id", id)
    .eq("organization_id", org.id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteRecord(
  table: string,
  id: string
): Promise<{ error?: string }> {
  const { client: supabase } = getServiceSupabase();
  if (!supabase) return { error: "Keine Datenbankverbindung." };
  const org = await getOrganizationContext();
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", id)
    .eq("organization_id", org.id);
  if (error) return { error: error.message };
  return {};
}

export async function listContentLinks() {
  noStore();
  try {
    const { client: supabase } = getServiceSupabase();
    if (!supabase) return [] as ContentLink[];
    const organization = await getOrganizationContext();
    const { data } = await supabase
      .from("content_links")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });
    return (data as ContentLink[]) || [];
  } catch (error) {
    return logAndFallback("listContentLinks", [] as ContentLink[], error);
  }
}
