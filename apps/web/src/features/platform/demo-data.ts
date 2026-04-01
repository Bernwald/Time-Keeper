import { Company, Contact, ContentItem, DashboardData, Document, Interaction, Project, Source, Task } from "@/lib/domain/types";

const organizationId = "11111111-1111-1111-1111-111111111111";

export const demoCompanies: Company[] = [
  {
    id: "50000000-0000-0000-0000-000000000001",
    organization_id: organizationId,
    name: "LoFood",
    legal_name: "LoFood GmbH",
    website: "https://example.com",
    status: "active",
    summary: "Primary pilot company for platform workflows.",
    notes_preview: "Strong operational fit and good feedback loops.",
    tag_names: ["pilot", "ai-ready"],
    created_at: "2026-03-25T09:00:00Z",
    updated_at: "2026-03-30T15:30:00Z",
    metadata: {}
  },
  {
    id: "50000000-0000-0000-0000-000000000002",
    organization_id: organizationId,
    name: "Regional Supply Labs",
    legal_name: "Regional Supply Labs UG",
    website: "https://example.org",
    status: "prospect",
    summary: "Potential partner for regional operations rollouts.",
    notes_preview: "Needs a second workshop.",
    tag_names: ["priority"],
    created_at: "2026-03-26T08:00:00Z",
    updated_at: "2026-03-31T08:30:00Z",
    metadata: {}
  }
];

export const demoContacts: Contact[] = [
  {
    id: "60000000-0000-0000-0000-000000000001",
    organization_id: organizationId,
    company_id: demoCompanies[0].id,
    company_name: demoCompanies[0].name,
    first_name: "Anna",
    last_name: "Keller",
    email: "anna@example.com",
    phone: "+49 151 00000001",
    role_title: "Operations Lead",
    status: "active",
    notes: "Prefers tight weekly follow-ups.",
    created_at: "2026-03-25T09:30:00Z",
    updated_at: "2026-03-30T15:00:00Z",
    metadata: {}
  },
  {
    id: "60000000-0000-0000-0000-000000000002",
    organization_id: organizationId,
    company_id: demoCompanies[1].id,
    company_name: demoCompanies[1].name,
    first_name: "Jonas",
    last_name: "Becker",
    email: "jonas@example.org",
    phone: "+49 151 00000002",
    role_title: "Founder",
    status: "active",
    notes: "Interested in a reusable customer rollout pattern.",
    created_at: "2026-03-26T08:30:00Z",
    updated_at: "2026-03-31T08:10:00Z",
    metadata: {}
  }
];

export const demoProjects: Project[] = [
  {
    id: "70000000-0000-0000-0000-000000000001",
    organization_id: organizationId,
    company_id: demoCompanies[0].id,
    company_name: demoCompanies[0].name,
    name: "Internal Platform Pilot",
    project_type: "project",
    status: "active",
    summary: "Build the first internal tenant and validate operating model.",
    created_at: "2026-03-25T10:00:00Z",
    updated_at: "2026-03-31T07:30:00Z",
    metadata: {}
  },
  {
    id: "70000000-0000-0000-0000-000000000002",
    organization_id: organizationId,
    company_id: demoCompanies[1].id,
    company_name: demoCompanies[1].name,
    name: "Customer Opportunity Mapping",
    project_type: "opportunity",
    status: "discovery",
    summary: "Explore how the same model can be adapted for external customers.",
    created_at: "2026-03-26T09:00:00Z",
    updated_at: "2026-03-31T09:10:00Z",
    metadata: {}
  }
];

export const demoDocuments: Document[] = [
  {
    id: "80000000-0000-0000-0000-000000000001",
    organization_id: organizationId,
    source_id: "40000000-0000-0000-0000-000000000001",
    title: "Platform Positioning Notes",
    document_type: "knowledge",
    status: "active",
    visibility_scope: "internal",
    content_markdown: "# Platform Positioning",
    content_text: "Internal notes on the platform position and reusable core.",
    origin_type: "manual",
    origin_ref: null,
    created_at: "2026-03-25T11:00:00Z",
    updated_at: "2026-03-30T16:00:00Z",
    metadata: {}
  },
  {
    id: "80000000-0000-0000-0000-000000000002",
    organization_id: organizationId,
    source_id: "40000000-0000-0000-0000-000000000001",
    title: "LoFood Meeting Summary",
    document_type: "meeting_note",
    status: "active",
    visibility_scope: "internal",
    content_markdown: "# LoFood Meeting Summary",
    content_text: "Validated need for linked company-contact-project workflow.",
    origin_type: "manual",
    origin_ref: null,
    created_at: "2026-03-29T09:00:00Z",
    updated_at: "2026-03-30T17:00:00Z",
    metadata: {}
  }
];

export const demoSources: Source[] = [
  {
    id: "40000000-0000-0000-0000-000000000001",
    organization_id: organizationId,
    source_type: "manual_note",
    source_origin: "internal",
    source_name: "Manual Entry",
    title: "Manual Entry",
    mime_type: "text/plain",
    external_url: null,
    storage_path: null,
    status: "ready",
    checksum: null,
    source_metadata: {},
    created_at: "2026-03-25T09:00:00Z",
    updated_at: "2026-03-30T15:30:00Z",
    metadata: {}
  },
  {
    id: "40000000-0000-0000-0000-000000000002",
    organization_id: organizationId,
    source_type: "manual_transcript",
    source_origin: "internal",
    source_name: "Meeting Transcript",
    title: "LoFood Transcript Input",
    mime_type: "text/plain",
    external_url: null,
    storage_path: null,
    status: "ready",
    checksum: null,
    source_metadata: {},
    created_at: "2026-03-29T09:00:00Z",
    updated_at: "2026-03-30T17:00:00Z",
    metadata: {}
  }
];

export const demoContentItems: ContentItem[] = [
  {
    id: "82000000-0000-0000-0000-000000000001",
    organization_id: organizationId,
    source_id: demoSources[0].id,
    source_title: demoSources[0].title,
    content_type: "research_note",
    title: "Platform Positioning Notes",
    raw_text: "# Platform Positioning",
    cleaned_text: "Platform Positioning Notes",
    summary: "Core positioning and implementation notes for the reusable platform model.",
    language: "en",
    status: "active",
    version: 1,
    content_metadata: { seeded: true },
    created_at: "2026-03-25T11:00:00Z",
    updated_at: "2026-03-30T16:00:00Z",
    metadata: {}
  },
  {
    id: "82000000-0000-0000-0000-000000000002",
    organization_id: organizationId,
    source_id: demoSources[1].id,
    source_title: demoSources[1].title,
    content_type: "transcript",
    title: "LoFood Meeting Transcript",
    raw_text: "Speaker 1: We need a linked operational workspace. Speaker 2: The knowledge layer should stay reusable.",
    cleaned_text: "Speaker 1: We need a linked operational workspace. Speaker 2: The knowledge layer should stay reusable.",
    summary: "Transcript snippet from the LoFood pilot conversation.",
    language: "en",
    status: "active",
    version: 1,
    content_metadata: { transcript_kind: "meeting" },
    created_at: "2026-03-29T09:00:00Z",
    updated_at: "2026-03-30T17:00:00Z",
    metadata: {}
  }
];

export const demoInteractions: Interaction[] = [
  {
    id: "90000000-0000-0000-0000-000000000001",
    organization_id: organizationId,
    company_id: demoCompanies[0].id,
    contact_id: demoContacts[0].id,
    project_id: demoProjects[0].id,
    document_id: demoDocuments[1].id,
    interaction_type: "meeting",
    occurred_at: "2026-03-29T10:00:00Z",
    summary: "Validated the need for a linked company-contact-project workspace.",
    next_steps: "Prepare first platform walkthrough.",
    company_name: demoCompanies[0].name,
    contact_name: `${demoContacts[0].first_name} ${demoContacts[0].last_name}`,
    project_name: demoProjects[0].name,
    created_at: "2026-03-29T10:00:00Z",
    updated_at: "2026-03-29T10:00:00Z",
    metadata: {}
  },
  {
    id: "90000000-0000-0000-0000-000000000002",
    organization_id: organizationId,
    company_id: demoCompanies[1].id,
    contact_id: demoContacts[1].id,
    project_id: demoProjects[1].id,
    document_id: null,
    interaction_type: "call",
    occurred_at: "2026-03-30T14:30:00Z",
    summary: "Discussed replication model and integration expectations.",
    next_steps: "Send architecture summary.",
    company_name: demoCompanies[1].name,
    contact_name: `${demoContacts[1].first_name} ${demoContacts[1].last_name}`,
    project_name: demoProjects[1].name,
    created_at: "2026-03-30T14:30:00Z",
    updated_at: "2026-03-30T14:30:00Z",
    metadata: {}
  }
];

export const demoTasks: Task[] = [
  {
    id: "91000000-0000-0000-0000-000000000001",
    organization_id: organizationId,
    company_id: demoCompanies[0].id,
    contact_id: demoContacts[0].id,
    project_id: demoProjects[0].id,
    assigned_to: null,
    title: "Prepare workspace walkthrough",
    description: "Show list/detail flows and linked records.",
    status: "in_progress",
    priority: "high",
    due_date: "2026-04-02",
    company_name: demoCompanies[0].name,
    contact_name: `${demoContacts[0].first_name} ${demoContacts[0].last_name}`,
    project_name: demoProjects[0].name,
    created_at: "2026-03-30T09:00:00Z",
    updated_at: "2026-03-31T07:00:00Z",
    metadata: {}
  },
  {
    id: "91000000-0000-0000-0000-000000000002",
    organization_id: organizationId,
    company_id: demoCompanies[1].id,
    contact_id: demoContacts[1].id,
    project_id: demoProjects[1].id,
    assigned_to: null,
    title: "Draft customer adaptation notes",
    description: "Translate internal learnings into a replicable setup.",
    status: "todo",
    priority: "medium",
    due_date: "2026-04-05",
    company_name: demoCompanies[1].name,
    contact_name: `${demoContacts[1].first_name} ${demoContacts[1].last_name}`,
    project_name: demoProjects[1].name,
    created_at: "2026-03-30T11:00:00Z",
    updated_at: "2026-03-31T06:45:00Z",
    metadata: {}
  }
];

export const demoDashboard: DashboardData = {
  overdueTasks: demoTasks.filter((task) => task.status !== "done"),
  recentInteractions: demoInteractions,
  activeProjects: demoProjects,
  recentDocuments: demoDocuments,
  companies: demoCompanies,
  recentSources: demoSources,
  recentContentItems: demoContentItems
};
