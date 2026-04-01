import type { FormField } from "@/components/entity-form";
import { statusOptions } from "@/lib/config/modules";
import type { Company, Contact, Project, Interaction, Task, Document, Source, ContentItem } from "@/lib/domain/types";

export function getCompanyFields(defaults?: Partial<Company>): FormField[] {
  return [
    { name: "name", label: "Name", required: true, defaultValue: defaults?.name },
    { name: "legal_name", label: "Rechtlicher Name", defaultValue: defaults?.legal_name },
    { name: "website", label: "Website", type: "url", defaultValue: defaults?.website },
    { name: "status", label: "Status", type: "select", options: [...statusOptions.companies], defaultValue: defaults?.status || "active" },
    { name: "summary", label: "Zusammenfassung", type: "textarea", full: true, defaultValue: defaults?.summary },
    { name: "notes_preview", label: "Notizen", type: "textarea", full: true, defaultValue: defaults?.notes_preview },
  ];
}

export function getContactFields(defaults?: Partial<Contact>): FormField[] {
  return [
    { name: "first_name", label: "Vorname", required: true, defaultValue: defaults?.first_name },
    { name: "last_name", label: "Nachname", required: true, defaultValue: defaults?.last_name },
    { name: "email", label: "E-Mail", type: "email", defaultValue: defaults?.email },
    { name: "phone", label: "Telefon", type: "tel", defaultValue: defaults?.phone },
    { name: "role_title", label: "Rolle/Titel", defaultValue: defaults?.role_title },
    { name: "status", label: "Status", type: "select", options: [...statusOptions.contacts], defaultValue: defaults?.status || "active" },
    { name: "notes", label: "Notizen", type: "textarea", full: true, defaultValue: defaults?.notes },
  ];
}

export function getProjectFields(defaults?: Partial<Project>): FormField[] {
  return [
    { name: "name", label: "Name", required: true, defaultValue: defaults?.name },
    { name: "project_type", label: "Projekttyp", type: "select", options: [
      { label: "Projekt", value: "project" },
      { label: "Opportunity", value: "opportunity" },
      { label: "Intern", value: "internal" },
    ], defaultValue: defaults?.project_type || "project" },
    { name: "status", label: "Status", type: "select", options: [...statusOptions.projects], defaultValue: defaults?.status || "active" },
    { name: "summary", label: "Zusammenfassung", type: "textarea", full: true, defaultValue: defaults?.summary },
  ];
}

export function getInteractionFields(defaults?: Partial<Interaction>): FormField[] {
  return [
    { name: "interaction_type", label: "Art", type: "select", options: [...statusOptions.interactions], defaultValue: defaults?.interaction_type || "meeting" },
    { name: "occurred_at", label: "Datum", type: "date", defaultValue: defaults?.occurred_at?.slice(0, 10) },
    { name: "summary", label: "Zusammenfassung", type: "textarea", full: true, required: true, defaultValue: defaults?.summary },
    { name: "next_steps", label: "Nächste Schritte", type: "textarea", full: true, defaultValue: defaults?.next_steps },
  ];
}

export function getTaskFields(defaults?: Partial<Task>): FormField[] {
  return [
    { name: "title", label: "Titel", required: true, defaultValue: defaults?.title },
    { name: "description", label: "Beschreibung", type: "textarea", full: true, defaultValue: defaults?.description },
    { name: "status", label: "Status", type: "select", options: [...statusOptions.tasks], defaultValue: defaults?.status || "todo" },
    { name: "priority", label: "Priorität", type: "select", options: [
      { label: "Niedrig", value: "low" },
      { label: "Mittel", value: "medium" },
      { label: "Hoch", value: "high" },
      { label: "Dringend", value: "urgent" },
    ], defaultValue: defaults?.priority },
    { name: "due_date", label: "Fällig am", type: "date", defaultValue: defaults?.due_date },
  ];
}

export function getDocumentFields(defaults?: Partial<Document>): FormField[] {
  return [
    { name: "title", label: "Titel", required: true, defaultValue: defaults?.title },
    { name: "document_type", label: "Dokumenttyp", type: "select", options: [
      { label: "Notiz", value: "note" },
      { label: "Meeting-Notiz", value: "meeting_note" },
      { label: "Wissen", value: "knowledge" },
      { label: "Vorlage", value: "template" },
    ], defaultValue: defaults?.document_type || "note" },
    { name: "status", label: "Status", type: "select", options: [...statusOptions.documents], defaultValue: defaults?.status || "draft" },
    { name: "origin_type", label: "Herkunft", type: "select", options: [
      { label: "Manuell", value: "manual" },
      { label: "Import", value: "import" },
      { label: "KI-generiert", value: "ai_generated" },
    ], defaultValue: defaults?.origin_type || "manual" },
    { name: "content_markdown", label: "Inhalt (Markdown)", type: "textarea", full: true, defaultValue: defaults?.content_markdown },
  ];
}

export function getSourceFields(defaults?: Partial<Source>): FormField[] {
  return [
    { name: "source_type", label: "Typ", type: "select", options: [
      { label: "Manuelle Notiz", value: "manual_note" },
      { label: "API", value: "api" },
      { label: "Webhook", value: "webhook" },
      { label: "Hochgeladene Datei", value: "uploaded_file" },
    ], defaultValue: defaults?.source_type || "manual_note" },
    { name: "source_origin", label: "Herkunft", type: "select", options: [
      { label: "Intern", value: "internal" },
      { label: "Extern", value: "external" },
    ], defaultValue: defaults?.source_origin || "internal" },
    { name: "source_name", label: "Name", required: true, defaultValue: defaults?.source_name },
    { name: "title", label: "Titel", defaultValue: defaults?.title },
    { name: "mime_type", label: "MIME-Typ", defaultValue: defaults?.mime_type },
    { name: "external_url", label: "Externe URL", type: "url", defaultValue: defaults?.external_url },
    { name: "status", label: "Status", type: "select", options: ["ready", "processing", "error"], defaultValue: defaults?.status || "ready" },
  ];
}

export function getContentItemFields(defaults?: Partial<ContentItem>): FormField[] {
  return [
    { name: "title", label: "Titel", required: true, defaultValue: defaults?.title },
    { name: "content_type", label: "Typ", type: "select", options: [
      { label: "Notiz", value: "note" },
      { label: "Transkript", value: "transcript" },
      { label: "Forschungsnotiz", value: "research_note" },
      { label: "Zusammenfassung", value: "summary" },
    ], defaultValue: defaults?.content_type || "note" },
    { name: "raw_text", label: "Rohtext", type: "textarea", full: true, required: true, defaultValue: defaults?.raw_text },
    { name: "summary", label: "Zusammenfassung", type: "textarea", full: true, defaultValue: defaults?.summary },
    { name: "language", label: "Sprache", type: "select", options: [
      { label: "Deutsch", value: "de" },
      { label: "Englisch", value: "en" },
    ], defaultValue: defaults?.language },
    { name: "status", label: "Status", type: "select", options: ["draft", "ready", "archived"], defaultValue: defaults?.status || "draft" },
  ];
}
