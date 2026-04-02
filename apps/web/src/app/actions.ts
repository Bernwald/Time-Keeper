"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/db/supabase-server";
import { requireOrgId } from "@/lib/db/org-context";
import { splitIntoChunks } from "@/lib/content/chunker";
import { countWords, extractTextFromPdf } from "@/lib/content/extractor";
import { embedText } from "@/lib/ai/embeddings";
import { transcribeAudio } from "@/lib/ai/transcribe";

// ─── SOURCES ──────────────────────────────────────────────────────────────

async function storeChunks(sourceId: string, text: string, orgId: string) {
  const db = createServiceClient();
  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) return;

  // Generate embeddings in parallel (graceful: null if no API key)
  const embeddings = await Promise.all(chunks.map((c) => embedText(c.chunkText)));

  const rows = chunks.map((c, i) => ({
    organization_id: orgId,
    source_id: sourceId,
    chunk_index: c.chunkIndex,
    chunk_text: c.chunkText,
    token_count: c.tokenCount,
    char_start: c.charStart,
    char_end: c.charEnd,
    embedding: embeddings[i] ? JSON.stringify(embeddings[i]) : null,
  }));

  await db.from("content_chunks").insert(rows);
}

export async function createTextSource(formData: FormData) {
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const rawText = formData.get("raw_text") as string;

  if (!title?.trim() || !rawText?.trim()) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();
  const { data, error } = await db
    .from("sources")
    .insert({
      organization_id: orgId,
      title: title.trim(),
      description: description?.trim() || null,
      source_type: "text",
      raw_text: rawText.trim(),
      word_count: countWords(rawText),
      status: "processing",
    })
    .select("id")
    .single();

  if (error || !data) return;

  await storeChunks(data.id, rawText, orgId);
  await db.from("sources").update({ status: "ready" }).eq("id", data.id);

  revalidatePath("/sources");
  redirect(`/sources/${data.id}`);
}

export async function createTranscriptSource(formData: FormData) {
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const rawText = formData.get("raw_text") as string;

  if (!title?.trim() || !rawText?.trim()) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();
  const { data, error } = await db
    .from("sources")
    .insert({
      organization_id: orgId,
      title: title.trim(),
      description: description?.trim() || null,
      source_type: "transcript",
      raw_text: rawText.trim(),
      word_count: countWords(rawText),
      status: "processing",
    })
    .select("id")
    .single();

  if (error || !data) return;

  await storeChunks(data.id, rawText, orgId);
  await db.from("sources").update({ status: "ready" }).eq("id", data.id);

  revalidatePath("/sources");
  redirect(`/sources/${data.id}`);
}

export async function createPdfSource(formData: FormData) {
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const file = formData.get("file") as File | null;

  if (!title?.trim() || !file) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();

  // Upload to Supabase Storage
  const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const storagePath = `${orgId}/${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await db.storage
    .from("source-files")
    .upload(storagePath, buffer, { contentType: file.type });

  if (uploadError) return;

  // Create source record
  const { data, error } = await db
    .from("sources")
    .insert({
      organization_id: orgId,
      title: title.trim(),
      description: description?.trim() || null,
      source_type: "pdf",
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type,
      status: "processing",
    })
    .select("id")
    .single();

  if (error || !data) return;

  // Extract text and chunk
  const text = await extractTextFromPdf(buffer);
  if (text.trim()) {
    await db
      .from("sources")
      .update({ raw_text: text, word_count: countWords(text) })
      .eq("id", data.id);
    await storeChunks(data.id, text, orgId);
  }

  await db.from("sources").update({ status: "ready" }).eq("id", data.id);

  revalidatePath("/sources");
  redirect(`/sources/${data.id}`);
}

// ─── RECORDING (VOICE) ──────────────────────────────────────────────

export async function createRecordingSource(formData: FormData) {
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const audioFile = formData.get("audio") as File | null;
  const linkType = formData.get("linkType") as string;
  const linkId = formData.get("linkId") as string;

  if (!title?.trim() || !audioFile) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();

  // Create source in processing state
  const { data, error } = await db
    .from("sources")
    .insert({
      organization_id: orgId,
      title: title.trim(),
      description: description?.trim() || null,
      source_type: "recording",
      original_filename: audioFile.name,
      mime_type: audioFile.type,
      status: "processing",
    })
    .select("id")
    .single();

  if (error || !data) return;

  // Transcribe via Whisper
  const transcript = await transcribeAudio(audioFile);

  if (transcript.trim()) {
    await db
      .from("sources")
      .update({ raw_text: transcript, word_count: countWords(transcript) })
      .eq("id", data.id);
    await storeChunks(data.id, transcript, orgId);
  }

  // Optional entity link
  if (linkType && linkId) {
    await db.from("source_links").upsert(
      {
        organization_id: orgId,
        source_id: data.id,
        linked_type: linkType,
        linked_id: linkId,
        link_role: "reference",
      },
      { onConflict: "source_id,linked_type,linked_id" },
    );
  }

  await db.from("sources").update({ status: "ready" }).eq("id", data.id);

  revalidatePath("/sources");
  redirect(`/sources/${data.id}`);
}

// ─── EMBEDDING BACKFILL ──────────────────────────────────────────────

export async function backfillEmbeddings(sourceId: string) {
  const db = createServiceClient();

  // Fetch chunks without embeddings for this source
  const { data: chunks, error } = await db
    .from("content_chunks")
    .select("id, chunk_text")
    .eq("source_id", sourceId)
    .is("embedding", null)
    .order("chunk_index");

  if (error || !chunks || chunks.length === 0) return { updated: 0 };

  let updated = 0;
  for (const chunk of chunks) {
    const embedding = await embedText(chunk.chunk_text);
    if (embedding) {
      await db
        .from("content_chunks")
        .update({ embedding: JSON.stringify(embedding) })
        .eq("id", chunk.id);
      updated++;
    }
  }

  revalidatePath(`/sources/${sourceId}`);
  return { updated };
}

// ─── BATCH IMPORT ────────────────────────────────────────────────────

export type ImportRow = {
  title: string;
  content: string;
  sourceType?: string;
  columnNames?: string[]; // original column names when multiple selected
  linkType?: string;   // 'company' | 'contact' | 'project'
  linkId?: string;     // UUID of the entity to link
};

export type BatchImportResult = {
  total: number;
  imported: number;
  errors: string[];
};

export async function batchImportSources(rows: ImportRow[]): Promise<BatchImportResult> {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  const result: BatchImportResult = { total: rows.length, imported: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.title?.trim() || !row.content?.trim()) {
      result.errors.push(`Zeile ${i + 1}: Titel oder Inhalt fehlt`);
      continue;
    }

    try {
      // Create source
      const wordCount = row.content.trim().split(/\s+/).filter(Boolean).length;
      const { data, error } = await db
        .from("sources")
        .insert({
          organization_id: orgId,
          title: row.title.trim(),
          source_type: row.sourceType || "text",
          raw_text: row.content.trim(),
          word_count: wordCount,
          status: "processing",
          metadata: row.columnNames ? { columns: row.columnNames } : {},
        })
        .select("id")
        .single();

      if (error || !data) {
        result.errors.push(`Zeile ${i + 1}: ${error?.message ?? "Fehler beim Anlegen"}`);
        continue;
      }

      // Chunk + embed
      await storeChunks(data.id, row.content, orgId);

      // Mark ready
      await db.from("sources").update({ status: "ready" }).eq("id", data.id);

      // Optional entity link
      if (row.linkType && row.linkId) {
        await db.from("source_links").upsert(
          {
            organization_id: orgId,
            source_id: data.id,
            linked_type: row.linkType,
            linked_id: row.linkId,
            link_role: "reference",
          },
          { onConflict: "source_id,linked_type,linked_id" },
        );
      }

      result.imported++;
    } catch (err) {
      result.errors.push(`Zeile ${i + 1}: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`);
    }
  }

  revalidatePath("/sources");
  return result;
}

// ─── SOURCE LINKS ────────────────────────────────────────────────────

export async function addSourceLink(sourceId: string, linkedType: string, linkedId: string) {
  if (!sourceId || !linkedType || !linkedId) return;
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db.from("source_links").upsert(
    {
      organization_id: orgId,
      source_id: sourceId,
      linked_type: linkedType,
      linked_id: linkedId,
      link_role: "reference",
    },
    { onConflict: "source_id,linked_type,linked_id" },
  );
  revalidatePath(`/sources/${sourceId}`);
}

export async function removeSourceLink(linkId: string, sourceId: string) {
  if (!linkId) return;
  const db = createServiceClient();
  await db.from("source_links").delete().eq("id", linkId);
  revalidatePath(`/sources/${sourceId}`);
}

export async function deleteSource(id: string) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db.from("content_chunks").delete().eq("source_id", id);
  await db.from("source_links").delete().eq("source_id", id);
  await db.from("sources").delete().eq("id", id).eq("organization_id", orgId);
  revalidatePath("/sources");
  redirect("/sources");
}

// ─── PROCESSES ──────────────────────────────────────────────────────────

export async function createProcessTemplate(formData: FormData) {
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const category = formData.get("category") as string;
  const stepsJson = formData.get("steps") as string;

  if (!name?.trim()) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();

  const { data, error } = await db
    .from("process_templates")
    .insert({
      organization_id: orgId,
      name: name.trim(),
      description: description?.trim() || null,
      category: category?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) return;

  // Insert steps
  if (stepsJson) {
    try {
      const steps = JSON.parse(stepsJson) as {
        name: string;
        description?: string;
        expected_duration_days?: number;
        responsible_role?: string;
      }[];
      if (steps.length > 0) {
        await db.from("process_template_steps").insert(
          steps.map((s, i) => ({
            template_id: data.id,
            step_order: i + 1,
            name: s.name,
            description: s.description || null,
            expected_duration_days: s.expected_duration_days || null,
            responsible_role: s.responsible_role || null,
          })),
        );
      }
    } catch {
      // Invalid JSON — skip steps
    }
  }

  revalidatePath("/processes");
  redirect("/processes");
}

export async function deleteProcessTemplate(id: string) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db.from("process_template_steps").delete().eq("template_id", id);
  await db.from("process_templates").delete().eq("id", id).eq("organization_id", orgId);
  revalidatePath("/processes");
  redirect("/processes");
}

export async function createProcessInstance(formData: FormData) {
  const templateId = formData.get("template_id") as string;
  const name = formData.get("name") as string;
  const projectId = formData.get("project_id") as string;
  const companyId = formData.get("company_id") as string;

  if (!templateId || !name?.trim()) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();

  // Get template steps
  const { data: templateSteps } = await db
    .from("process_template_steps")
    .select("*")
    .eq("template_id", templateId)
    .order("step_order");

  const { data, error } = await db
    .from("process_instances")
    .insert({
      organization_id: orgId,
      template_id: templateId,
      name: name.trim(),
      project_id: projectId || null,
      company_id: companyId || null,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !data) return;

  // Copy template steps to instance
  if (templateSteps && templateSteps.length > 0) {
    await db.from("process_instance_steps").insert(
      templateSteps.map((ts) => ({
        instance_id: data.id,
        template_step_id: ts.id,
        step_order: ts.step_order,
        name: ts.name,
        status: "pending",
      })),
    );
  }

  revalidatePath("/processes");
  redirect(`/processes/${data.id}`);
}

export async function updateProcessStep(
  stepId: string,
  instanceId: string,
  status: string,
) {
  const db = createServiceClient();
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = { status };
  if (status === "in_progress" ) {
    updates.started_at = now;
  } else if (status === "completed") {
    updates.completed_at = now;
  }

  await db.from("process_instance_steps").update(updates).eq("id", stepId);

  // Check if all steps are completed → mark instance as completed
  const { data: steps } = await db
    .from("process_instance_steps")
    .select("status")
    .eq("instance_id", instanceId);

  if (steps && steps.every((s) => s.status === "completed" || s.status === "skipped")) {
    await db
      .from("process_instances")
      .update({ status: "completed", completed_at: now })
      .eq("id", instanceId);
  }

  revalidatePath(`/processes/${instanceId}`);
}

export async function deleteProcessInstance(id: string) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db.from("process_instance_steps").delete().eq("instance_id", id);
  await db.from("process_instances").delete().eq("id", id).eq("organization_id", orgId);
  revalidatePath("/processes");
  redirect("/processes");
}

// ─── ACTIVITIES ──────────────────────────────────────────────────────────

export async function createActivity(formData: FormData) {
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const activityType = formData.get("activity_type") as string;
  const occurredAt = formData.get("occurred_at") as string;
  const durationMinutes = formData.get("duration_minutes") as string;
  const linkType = formData.get("link_type") as string;
  const linkId = formData.get("link_id") as string;

  if (!title?.trim() || !activityType) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();

  const { data, error } = await db
    .from("activities")
    .insert({
      organization_id: orgId,
      activity_type: activityType,
      title: title.trim(),
      description: description?.trim() || null,
      occurred_at: occurredAt || new Date().toISOString(),
      duration_minutes: durationMinutes ? parseInt(durationMinutes, 10) : null,
    })
    .select("id")
    .single();

  if (error || !data) return;

  // Link to entity if provided
  if (linkType && linkId) {
    await db.from("activity_links").insert({
      organization_id: orgId,
      activity_id: data.id,
      linked_type: linkType,
      linked_id: linkId,
    });
  }

  // Auto-RAG: create source from activity text for RAG searchability
  const textForRag = description?.trim();
  if (textForRag && textForRag.length > 20) {
    const { data: source } = await db
      .from("sources")
      .insert({
        organization_id: orgId,
        title: `[${activityType}] ${title.trim()}`,
        description: `Automatisch erstellt aus Aktivitaet vom ${new Date(occurredAt || Date.now()).toLocaleDateString("de-DE")}`,
        source_type: "activity_note",
        raw_text: textForRag,
        word_count: countWords(textForRag),
        status: "processing",
      })
      .select("id")
      .single();

    if (source) {
      await storeChunks(source.id, textForRag, orgId);
      await db.from("sources").update({ status: "ready" }).eq("id", source.id);

      // Link source to same entity as the activity
      if (linkType && linkId) {
        await db.from("source_links").upsert(
          {
            organization_id: orgId,
            source_id: source.id,
            linked_type: linkType,
            linked_id: linkId,
            link_role: "activity",
          },
          { onConflict: "source_id,linked_type,linked_id" },
        );
      }
    }
  }

  revalidatePath("/activities");
  if (linkType && linkId) {
    revalidatePath(`/${linkType === "company" ? "companies" : linkType === "contact" ? "contacts" : "projects"}/${linkId}`);
  }
  redirect("/activities");
}

export async function deleteActivity(id: string) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db.from("activity_links").delete().eq("activity_id", id);
  await db.from("activities").delete().eq("id", id).eq("organization_id", orgId);
  revalidatePath("/activities");
  redirect("/activities");
}

// ─── TAGS ────────────────────────────────────────────────────────────────

export async function createTag(formData: FormData) {
  const name = formData.get("name") as string;
  const color = formData.get("color") as string;
  const category = formData.get("category") as string;

  if (!name?.trim()) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db.from("tags").insert({
    organization_id: orgId,
    name: name.trim(),
    color: color?.trim() || null,
    category: category?.trim() || null,
  });
  revalidatePath("/admin/tags");
}

export async function updateTag(id: string, formData: FormData) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db
    .from("tags")
    .update({
      name: (formData.get("name") as string).trim(),
      color: (formData.get("color") as string)?.trim() || null,
      category: (formData.get("category") as string)?.trim() || null,
    })
    .eq("id", id)
    .eq("organization_id", orgId);
  revalidatePath("/admin/tags");
}

export async function deleteTag(id: string) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db.from("entity_tags").delete().eq("tag_id", id);
  await db.from("tags").delete().eq("id", id).eq("organization_id", orgId);
  revalidatePath("/admin/tags");
}

export async function addEntityTag(
  tagId: string,
  entityType: string,
  entityId: string,
) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db.from("entity_tags").upsert(
    {
      organization_id: orgId,
      tag_id: tagId,
      entity_type: entityType,
      entity_id: entityId,
    },
    { onConflict: "tag_id,entity_type,entity_id" },
  );
}

export async function removeEntityTag(
  tagId: string,
  entityType: string,
  entityId: string,
) {
  const db = createServiceClient();
  await db
    .from("entity_tags")
    .delete()
    .eq("tag_id", tagId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
}

// ─── COMPANIES ────────────────────────────────────────────────────────────

export async function createCompany(formData: FormData) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  const { data, error } = await db
    .from("companies")
    .insert({
      organization_id: orgId,
      name: (formData.get("name") as string).trim(),
      website: (formData.get("website") as string)?.trim() || null,
      status: (formData.get("status") as string) || "active",
      notes: (formData.get("notes") as string)?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !data) return;
  revalidatePath("/companies");
  redirect(`/companies/${data.id}`);
}

export async function updateCompany(id: string, formData: FormData) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db
    .from("companies")
    .update({
      name: (formData.get("name") as string).trim(),
      website: (formData.get("website") as string)?.trim() || null,
      status: (formData.get("status") as string) || "active",
      notes: (formData.get("notes") as string)?.trim() || null,
    })
    .eq("id", id)
    .eq("organization_id", orgId);
  revalidatePath(`/companies/${id}`);
  revalidatePath("/companies");
  redirect(`/companies/${id}`);
}

export async function deleteCompany(id: string) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db.from("companies").delete().eq("id", id).eq("organization_id", orgId);
  revalidatePath("/companies");
  redirect("/companies");
}

// ─── CONTACTS ─────────────────────────────────────────────────────────────

export async function createContact(formData: FormData) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  const { data, error } = await db
    .from("contacts")
    .insert({
      organization_id: orgId,
      company_id: (formData.get("company_id") as string) || null,
      first_name: (formData.get("first_name") as string).trim(),
      last_name: (formData.get("last_name") as string).trim(),
      email: (formData.get("email") as string)?.trim() || null,
      phone: (formData.get("phone") as string)?.trim() || null,
      role_title: (formData.get("role_title") as string)?.trim() || null,
      status: (formData.get("status") as string) || "active",
      notes: (formData.get("notes") as string)?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !data) return;
  revalidatePath("/contacts");
  redirect(`/contacts/${data.id}`);
}

export async function updateContact(id: string, formData: FormData) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db
    .from("contacts")
    .update({
      company_id: (formData.get("company_id") as string) || null,
      first_name: (formData.get("first_name") as string).trim(),
      last_name: (formData.get("last_name") as string).trim(),
      email: (formData.get("email") as string)?.trim() || null,
      phone: (formData.get("phone") as string)?.trim() || null,
      role_title: (formData.get("role_title") as string)?.trim() || null,
      status: (formData.get("status") as string) || "active",
      notes: (formData.get("notes") as string)?.trim() || null,
    })
    .eq("id", id)
    .eq("organization_id", orgId);
  revalidatePath(`/contacts/${id}`);
  revalidatePath("/contacts");
  redirect(`/contacts/${id}`);
}

export async function deleteContact(id: string) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db.from("contacts").delete().eq("id", id).eq("organization_id", orgId);
  revalidatePath("/contacts");
  redirect("/contacts");
}

// ─── PROJECTS ─────────────────────────────────────────────────────────────

export async function createProject(formData: FormData) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  const { data, error } = await db
    .from("projects")
    .insert({
      organization_id: orgId,
      company_id: (formData.get("company_id") as string) || null,
      name: (formData.get("name") as string).trim(),
      status: (formData.get("status") as string) || "active",
      description: (formData.get("description") as string)?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !data) return;
  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

export async function updateProject(id: string, formData: FormData) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db
    .from("projects")
    .update({
      company_id: (formData.get("company_id") as string) || null,
      name: (formData.get("name") as string).trim(),
      status: (formData.get("status") as string) || "active",
      description: (formData.get("description") as string)?.trim() || null,
    })
    .eq("id", id)
    .eq("organization_id", orgId);
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  redirect(`/projects/${id}`);
}

export async function deleteProject(id: string) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db.from("projects").delete().eq("id", id).eq("organization_id", orgId);
  revalidatePath("/projects");
  redirect("/projects");
}
