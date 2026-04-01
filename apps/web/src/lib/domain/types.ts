export type BaseRecord = {
  id: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
};

export type Company = BaseRecord & {
  name: string;
  legal_name?: string | null;
  website?: string | null;
  status: string;
  summary?: string | null;
  notes_preview?: string | null;
  tag_names?: string[];
};

export type Contact = BaseRecord & {
  company_id?: string | null;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  role_title?: string | null;
  status: string;
  notes?: string | null;
  company_name?: string | null;
};

export type Project = BaseRecord & {
  company_id?: string | null;
  name: string;
  project_type: string;
  status: string;
  summary?: string | null;
  company_name?: string | null;
};

export type Interaction = BaseRecord & {
  company_id?: string | null;
  contact_id?: string | null;
  project_id?: string | null;
  document_id?: string | null;
  interaction_type: string;
  occurred_at: string;
  summary: string;
  next_steps?: string | null;
  company_name?: string | null;
  contact_name?: string | null;
  project_name?: string | null;
};

export type Task = BaseRecord & {
  company_id?: string | null;
  contact_id?: string | null;
  project_id?: string | null;
  assigned_to?: string | null;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  due_date?: string | null;
  company_name?: string | null;
  contact_name?: string | null;
  project_name?: string | null;
};

export type Document = BaseRecord & {
  source_id?: string | null;
  title: string;
  document_type: string;
  status: string;
  visibility_scope: string;
  content_markdown?: string | null;
  content_text?: string | null;
  origin_type: string;
  origin_ref?: string | null;
};

export type Source = BaseRecord & {
  source_type: string;
  source_origin: string;
  source_name: string;
  title?: string | null;
  mime_type?: string | null;
  external_url?: string | null;
  storage_path?: string | null;
  status: string;
  checksum?: string | null;
  source_metadata?: Record<string, unknown>;
};

export type ContentItem = BaseRecord & {
  source_id?: string | null;
  content_type: string;
  title: string;
  raw_text?: string | null;
  cleaned_text?: string | null;
  summary?: string | null;
  language?: string | null;
  status: string;
  version: number;
  content_metadata?: Record<string, unknown>;
  source_title?: string | null;
};

export type ContentLink = {
  id: string;
  organization_id: string;
  content_item_id: string;
  linked_object_type: string;
  linked_object_id: string;
  link_role: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type DashboardData = {
  overdueTasks: Task[];
  recentInteractions: Interaction[];
  activeProjects: Project[];
  recentDocuments: Document[];
  companies: Company[];
  recentSources?: Source[];
  recentContentItems?: ContentItem[];
};

export type OrganizationContext = {
  id: string;
  slug: string;
  name: string;
};
