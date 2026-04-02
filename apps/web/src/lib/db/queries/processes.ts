import { createUserClient } from "../supabase-server";
import { requireOrgId } from "../org-context";

export type ProcessTemplate = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ProcessTemplateStep = {
  id: string;
  template_id: string;
  step_order: number;
  name: string;
  description: string | null;
  expected_duration_days: number | null;
  responsible_role: string | null;
};

export type ProcessInstance = {
  id: string;
  template_id: string;
  project_id: string | null;
  company_id: string | null;
  name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ProcessInstanceStep = {
  id: string;
  instance_id: string;
  template_step_id: string | null;
  step_order: number;
  name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
};

export type ProcessAnalysis = {
  step_name: string;
  step_order: number;
  status: string;
  expected_duration_days: number | null;
  actual_days: number | null;
  deviation_days: number | null;
  started_at: string | null;
  completed_at: string | null;
};

export type TemplatePerformance = {
  total_instances: number;
  completed_instances: number;
  completion_rate: number;
  avg_duration_days: number | null;
  bottleneck_step: string | null;
  bottleneck_avg_deviation: number | null;
};

export type ProcessDashboard = {
  active_instances: number;
  completed_instances: number;
  overdue_steps: number;
  avg_completion_days: number | null;
};

export const PROCESS_CATEGORIES = [
  { value: "onboarding", label: "Onboarding" },
  { value: "integration", label: "Integration" },
  { value: "review", label: "Review" },
  { value: "custom", label: "Individuell" },
] as const;

export const RESPONSIBLE_ROLES = [
  { value: "consultant", label: "Berater" },
  { value: "client", label: "Kunde" },
  { value: "admin", label: "Admin" },
] as const;

// ─── TEMPLATES ──────────────────────────────────────────────────────────

export async function listTemplates(): Promise<ProcessTemplate[]> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db
    .from("process_templates")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getTemplateById(id: string): Promise<ProcessTemplate | null> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db
    .from("process_templates")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();
  if (error) return null;
  return data;
}

export async function getTemplateSteps(templateId: string): Promise<ProcessTemplateStep[]> {
  const db = await createUserClient();
  const { data, error } = await db
    .from("process_template_steps")
    .select("*")
    .eq("template_id", templateId)
    .order("step_order");
  if (error) throw error;
  return data ?? [];
}

// ─── INSTANCES ──────────────────────────────────────────────────────────

export async function listInstances(status?: string): Promise<ProcessInstance[]> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  let query = db
    .from("process_instances")
    .select("*")
    .eq("organization_id", orgId)
    .order("started_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getInstanceById(id: string): Promise<ProcessInstance | null> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db
    .from("process_instances")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();
  if (error) return null;
  return data;
}

export async function getInstanceSteps(instanceId: string): Promise<ProcessInstanceStep[]> {
  const db = await createUserClient();
  const { data, error } = await db
    .from("process_instance_steps")
    .select("*")
    .eq("instance_id", instanceId)
    .order("step_order");
  if (error) throw error;
  return data ?? [];
}

export async function getInstancesForEntity(
  entityType: "project" | "company",
  entityId: string,
): Promise<ProcessInstance[]> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const column = entityType === "project" ? "project_id" : "company_id";
  const { data, error } = await db
    .from("process_instances")
    .select("*")
    .eq("organization_id", orgId)
    .eq(column, entityId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ─── ANALYSIS ───────────────────────────────────────────────────────────

export async function getProcessAnalysis(instanceId: string): Promise<ProcessAnalysis[]> {
  const db = await createUserClient();
  const { data, error } = await db.rpc("get_process_analysis", {
    p_instance_id: instanceId,
  });
  if (error) throw error;
  return (data ?? []) as ProcessAnalysis[];
}

export async function getTemplatePerformance(templateId: string): Promise<TemplatePerformance | null> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db.rpc("get_template_performance", {
    p_template_id: templateId,
    p_org_id: orgId,
  });
  if (error) return null;
  return (data?.[0] ?? null) as TemplatePerformance | null;
}

export async function getProcessDashboard(): Promise<ProcessDashboard | null> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db.rpc("get_process_dashboard", {
    p_org_id: orgId,
  });
  if (error) return null;
  return (data?.[0] ?? null) as ProcessDashboard | null;
}
