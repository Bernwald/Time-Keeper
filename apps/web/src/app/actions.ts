"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/db/supabase-server";
import { requireOrgId } from "@/lib/db/org-context";
import { splitIntoChunks } from "@/lib/content/chunker";
import { countWords, extractTextFromPdf } from "@/lib/content/extractor";
import { embedBatch } from "@/lib/ai/embeddings";
import { transcribeAudio } from "@/lib/ai/transcribe";
import {
  textSourceSchema,
  pdfSourceMetaSchema,
  recordingSourceSchema,
  activitySchema,
  importRowSchema,
  sourceLinkSchema,
  processTemplateSchema,
  processTemplateStepSchema,
  processInstanceSchema,
  stepStatusSchema,
  tagSchema,
  companySchema,
  contactSchema,
  projectSchema,
  linkTypeSchema,
  validatePdfFile,
  validateAudioFile,
  formDataToObject,
} from "@/lib/validation/schemas";

// ─── SECURITY HELPERS ─────────────────────────────────────────────────────
// All server actions use the service-role client (RLS bypassed), so ownership
// must be enforced in application code. These helpers verify that a given
// record belongs to the caller's organization BEFORE mutating.

async function assertSourceBelongsToOrg(sourceId: string, orgId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data } = await db
    .from("sources")
    .select("id")
    .eq("id", sourceId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return !!data;
}

async function assertProcessInstanceBelongsToOrg(
  instanceId: string,
  orgId: string,
): Promise<boolean> {
  const db = createServiceClient();
  const { data } = await db
    .from("process_instances")
    .select("id")
    .eq("id", instanceId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return !!data;
}

async function assertProcessTemplateBelongsToOrg(
  templateId: string,
  orgId: string,
): Promise<boolean> {
  const db = createServiceClient();
  const { data } = await db
    .from("process_templates")
    .select("id")
    .eq("id", templateId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return !!data;
}

// ─── SOURCES ──────────────────────────────────────────────────────────────

async function storeChunks(sourceId: string, text: string, orgId: string) {
  const db = createServiceClient();
  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) return;

  // Generate embeddings in ONE batched request (graceful: nulls if no API key)
  const embeddings = await embedBatch(chunks.map((c) => c.chunkText));

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
  const parsed = textSourceSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    rawText: formData.get("raw_text"),
  });
  if (!parsed.success) return;
  const { title, description, rawText } = parsed.data;

  const orgId = await requireOrgId();
  const db = createServiceClient();
  const { data, error } = await db
    .from("sources")
    .insert({
      organization_id: orgId,
      title,
      description,
      source_type: "text",
      raw_text: rawText,
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
  const parsed = textSourceSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    rawText: formData.get("raw_text"),
  });
  if (!parsed.success) return;
  const { title, description, rawText } = parsed.data;

  const orgId = await requireOrgId();
  const db = createServiceClient();
  const { data, error } = await db
    .from("sources")
    .insert({
      organization_id: orgId,
      title,
      description,
      source_type: "transcript",
      raw_text: rawText,
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
  const parsed = pdfSourceMetaSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
  });
  if (!parsed.success) return;
  const { title, description } = parsed.data;

  const file = formData.get("file") as File | null;
  if (!file) return;
  const fileCheck = validatePdfFile(file);
  if (!fileCheck.ok) return;

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
      title,
      description,
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
  const parsed = recordingSourceSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    linkType: formData.get("linkType") || null,
    linkId: formData.get("linkId") || null,
  });
  if (!parsed.success) return;
  const { title, description, linkType, linkId } = parsed.data;

  const audioFile = formData.get("audio") as File | null;
  if (!audioFile) return;
  const fileCheck = validateAudioFile(audioFile);
  if (!fileCheck.ok) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();

  // Create source in processing state
  const { data, error } = await db
    .from("sources")
    .insert({
      organization_id: orgId,
      title,
      description,
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
  // Critical: verify caller owns this source BEFORE doing any OpenAI work.
  const orgId = await requireOrgId();
  if (!(await assertSourceBelongsToOrg(sourceId, orgId))) {
    return { updated: 0 };
  }

  const db = createServiceClient();

  // Fetch chunks without embeddings — scoped by both source AND org
  const { data: chunks, error } = await db
    .from("content_chunks")
    .select("id, chunk_text")
    .eq("source_id", sourceId)
    .eq("organization_id", orgId)
    .is("embedding", null)
    .order("chunk_index");

  if (error || !chunks || chunks.length === 0) return { updated: 0 };

  // Batch-embed in one request instead of N sequential OpenAI calls
  const embeddings = await embedBatch(chunks.map((c) => c.chunk_text));

  let updated = 0;
  const updatePromises: Promise<unknown>[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const embedding = embeddings[i];
    if (!embedding) continue;
    updatePromises.push(
      Promise.resolve(
        db
          .from("content_chunks")
          .update({ embedding: JSON.stringify(embedding) })
          .eq("id", chunks[i].id)
          .eq("organization_id", orgId),
      ),
    );
    updated++;
  }
  await Promise.all(updatePromises);

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

const MAX_BATCH_IMPORT_ROWS = 5_000;

export async function batchImportSources(rows: ImportRow[]): Promise<BatchImportResult> {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  const result: BatchImportResult = { total: rows.length, imported: 0, errors: [] };

  if (rows.length > MAX_BATCH_IMPORT_ROWS) {
    result.errors.push(`Maximal ${MAX_BATCH_IMPORT_ROWS} Zeilen pro Import`);
    return result;
  }

  for (let i = 0; i < rows.length; i++) {
    const rowParse = importRowSchema.safeParse(rows[i]);
    if (!rowParse.success) {
      result.errors.push(`Zeile ${i + 1}: Ungültige Daten (${rowParse.error.issues[0]?.message ?? "Fehler"})`);
      continue;
    }
    const row = rowParse.data;

    try {
      // Create source
      const wordCount = row.content.split(/\s+/).filter(Boolean).length;
      const { data, error } = await db
        .from("sources")
        .insert({
          organization_id: orgId,
          title: row.title,
          source_type: row.sourceType || "text",
          raw_text: row.content,
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
  const parsed = sourceLinkSchema.safeParse({ sourceId, linkedType, linkedId });
  if (!parsed.success) return;

  const orgId = await requireOrgId();
  // Verify caller owns the source before creating a link on it.
  if (!(await assertSourceBelongsToOrg(parsed.data.sourceId, orgId))) return;

  const db = createServiceClient();
  await db.from("source_links").upsert(
    {
      organization_id: orgId,
      source_id: parsed.data.sourceId,
      linked_type: parsed.data.linkedType,
      linked_id: parsed.data.linkedId,
      link_role: "reference",
    },
    { onConflict: "source_id,linked_type,linked_id" },
  );
  revalidatePath(`/sources/${parsed.data.sourceId}`);
}

export async function removeSourceLink(linkId: string, sourceId: string) {
  if (!linkId) return;
  const orgId = await requireOrgId();
  const db = createServiceClient();
  // Scope the delete by org so a caller can only remove their own links.
  await db.from("source_links").delete().eq("id", linkId).eq("organization_id", orgId);
  revalidatePath(`/sources/${sourceId}`);
}

export async function deleteSource(id: string) {
  const orgId = await requireOrgId();
  // Verify ownership before touching any child tables.
  if (!(await assertSourceBelongsToOrg(id, orgId))) return;

  const db = createServiceClient();
  // All child deletes are now scoped by org as defense in depth.
  await db.from("content_chunks").delete().eq("source_id", id).eq("organization_id", orgId);
  await db.from("source_links").delete().eq("source_id", id).eq("organization_id", orgId);
  await db.from("sources").delete().eq("id", id).eq("organization_id", orgId);
  revalidatePath("/sources");
  redirect("/sources");
}

// ─── PROCESSES ──────────────────────────────────────────────────────────

export async function createProcessTemplate(formData: FormData) {
  const parsed = processTemplateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    category: formData.get("category"),
  });
  if (!parsed.success) return;
  const { name, description, category } = parsed.data;

  const orgId = await requireOrgId();
  const db = createServiceClient();

  const { data, error } = await db
    .from("process_templates")
    .insert({
      organization_id: orgId,
      name,
      description,
      category,
    })
    .select("id")
    .single();

  if (error || !data) return;

  // Insert steps
  const stepsJson = formData.get("steps") as string | null;
  if (stepsJson) {
    try {
      const rawSteps = JSON.parse(stepsJson);
      if (Array.isArray(rawSteps) && rawSteps.length > 0 && rawSteps.length <= 200) {
        const steps = rawSteps
          .map((s) => processTemplateStepSchema.safeParse(s))
          .filter((r) => r.success)
          .map((r) => r.data!);
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
  // Verify ownership before touching child steps.
  if (!(await assertProcessTemplateBelongsToOrg(id, orgId))) return;

  const db = createServiceClient();
  // Child delete scoped by verifying the template FK chain indirectly:
  // we just verified the template belongs to this org, so it's safe to delete its steps.
  await db.from("process_template_steps").delete().eq("template_id", id);
  await db.from("process_templates").delete().eq("id", id).eq("organization_id", orgId);
  revalidatePath("/processes");
  redirect("/processes");
}

export async function createProcessInstance(formData: FormData) {
  const parsed = processInstanceSchema.safeParse({
    templateId: formData.get("template_id"),
    name: formData.get("name"),
    projectId: formData.get("project_id") || null,
    companyId: formData.get("company_id") || null,
  });
  if (!parsed.success) return;
  const { templateId, name, projectId, companyId } = parsed.data;

  const orgId = await requireOrgId();
  // Verify the template belongs to the caller's org — otherwise they could
  // fork a foreign template into their own instance.
  if (!(await assertProcessTemplateBelongsToOrg(templateId, orgId))) return;

  const db = createServiceClient();

  // Get template steps (scoped: template_id already verified above)
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
      name,
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
  // Critical fix: verify ownership of the instance BEFORE touching any row.
  const statusParse = stepStatusSchema.safeParse(status);
  if (!statusParse.success) return;
  const validStatus = statusParse.data;

  const orgId = await requireOrgId();
  if (!(await assertProcessInstanceBelongsToOrg(instanceId, orgId))) return;

  const db = createServiceClient();
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = { status: validStatus };
  if (validStatus === "in_progress") {
    updates.started_at = now;
  } else if (validStatus === "completed") {
    updates.completed_at = now;
  }

  // Scope by instance_id as well — prevents flipping a step whose id was guessed
  // but which belongs to a different instance of the same org.
  await db
    .from("process_instance_steps")
    .update(updates)
    .eq("id", stepId)
    .eq("instance_id", instanceId);

  // Check if all steps are completed → mark instance as completed
  const { data: steps } = await db
    .from("process_instance_steps")
    .select("status")
    .eq("instance_id", instanceId);

  if (steps && steps.every((s) => s.status === "completed" || s.status === "skipped")) {
    await db
      .from("process_instances")
      .update({ status: "completed", completed_at: now })
      .eq("id", instanceId)
      .eq("organization_id", orgId);
  }

  revalidatePath(`/processes/${instanceId}`);
}

export async function deleteProcessInstance(id: string) {
  const orgId = await requireOrgId();
  // Verify ownership before deleting children.
  if (!(await assertProcessInstanceBelongsToOrg(id, orgId))) return;

  const db = createServiceClient();
  await db.from("process_instance_steps").delete().eq("instance_id", id);
  await db.from("process_instances").delete().eq("id", id).eq("organization_id", orgId);
  revalidatePath("/processes");
  redirect("/processes");
}

// ─── ACTIVITIES ──────────────────────────────────────────────────────────

export async function createActivity(formData: FormData) {
  const parsed = activitySchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    activityType: formData.get("activity_type"),
    occurredAt: formData.get("occurred_at") || null,
    durationMinutes: formData.get("duration_minutes"),
    linkType: formData.get("link_type") || null,
    linkId: formData.get("link_id") || null,
  });
  if (!parsed.success) return;
  const { title, description, activityType, occurredAt, durationMinutes, linkType, linkId } = parsed.data;

  const orgId = await requireOrgId();
  const db = createServiceClient();

  const { data, error } = await db
    .from("activities")
    .insert({
      organization_id: orgId,
      activity_type: activityType,
      title,
      description,
      occurred_at: occurredAt || new Date().toISOString(),
      duration_minutes: durationMinutes ?? null,
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
  const textForRag = description ?? "";
  if (textForRag.length > 20) {
    const { data: source } = await db
      .from("sources")
      .insert({
        organization_id: orgId,
        title: `[${activityType}] ${title}`,
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
  // Verify ownership, then scope both child and parent delete by org.
  const { data: owned } = await db
    .from("activities")
    .select("id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!owned) return;

  await db.from("activity_links").delete().eq("activity_id", id).eq("organization_id", orgId);
  await db.from("activities").delete().eq("id", id).eq("organization_id", orgId);
  revalidatePath("/activities");
  redirect("/activities");
}

// ─── TAGS ────────────────────────────────────────────────────────────────

export async function createTag(formData: FormData) {
  const parsed = tagSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
    category: formData.get("category"),
  });
  if (!parsed.success) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db.from("tags").insert({
    organization_id: orgId,
    name: parsed.data.name,
    color: parsed.data.color,
    category: parsed.data.category,
  });
  revalidatePath("/admin/tags");
}

export async function updateTag(id: string, formData: FormData) {
  const parsed = tagSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
    category: formData.get("category"),
  });
  if (!parsed.success) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db
    .from("tags")
    .update({
      name: parsed.data.name,
      color: parsed.data.color,
      category: parsed.data.category,
    })
    .eq("id", id)
    .eq("organization_id", orgId);
  revalidatePath("/admin/tags");
}

export async function deleteTag(id: string) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  // Verify ownership first, then scope both deletes.
  const { data: owned } = await db
    .from("tags")
    .select("id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!owned) return;

  await db.from("entity_tags").delete().eq("tag_id", id).eq("organization_id", orgId);
  await db.from("tags").delete().eq("id", id).eq("organization_id", orgId);
  revalidatePath("/admin/tags");
}

export async function addEntityTag(
  tagId: string,
  entityType: string,
  entityId: string,
) {
  const typeParse = linkTypeSchema.safeParse(entityType);
  if (!typeParse.success) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();
  // Verify tag belongs to caller's org — otherwise they could cross-reference foreign tags.
  const { data: ownedTag } = await db
    .from("tags")
    .select("id")
    .eq("id", tagId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!ownedTag) return;

  await db.from("entity_tags").upsert(
    {
      organization_id: orgId,
      tag_id: tagId,
      entity_type: typeParse.data,
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
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db
    .from("entity_tags")
    .delete()
    .eq("tag_id", tagId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("organization_id", orgId);
}

// ─── COMPANIES ────────────────────────────────────────────────────────────

export async function createCompany(formData: FormData) {
  const parsed = companySchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();
  const { data, error } = await db
    .from("companies")
    .insert({
      organization_id: orgId,
      name: parsed.data.name,
      website: parsed.data.website,
      status: parsed.data.status,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();
  if (error || !data) return;
  revalidatePath("/companies");
  redirect(`/companies/${data.id}`);
}

export async function updateCompany(id: string, formData: FormData) {
  const parsed = companySchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db
    .from("companies")
    .update({
      name: parsed.data.name,
      website: parsed.data.website,
      status: parsed.data.status,
      notes: parsed.data.notes,
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

function contactInputFromForm(formData: FormData) {
  return {
    companyId: formData.get("company_id") || null,
    firstName: formData.get("first_name"),
    lastName: formData.get("last_name"),
    email: formData.get("email") || null,
    phone: formData.get("phone") || null,
    roleTitle: formData.get("role_title") || null,
    status: formData.get("status") || "active",
    notes: formData.get("notes") || null,
  };
}

export async function createContact(formData: FormData) {
  const parsed = contactSchema.safeParse(contactInputFromForm(formData));
  if (!parsed.success) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();
  const { data, error } = await db
    .from("contacts")
    .insert({
      organization_id: orgId,
      company_id: parsed.data.companyId,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      role_title: parsed.data.roleTitle,
      status: parsed.data.status,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();
  if (error || !data) return;
  revalidatePath("/contacts");
  redirect(`/contacts/${data.id}`);
}

export async function updateContact(id: string, formData: FormData) {
  const parsed = contactSchema.safeParse(contactInputFromForm(formData));
  if (!parsed.success) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db
    .from("contacts")
    .update({
      company_id: parsed.data.companyId,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      role_title: parsed.data.roleTitle,
      status: parsed.data.status,
      notes: parsed.data.notes,
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

function projectInputFromForm(formData: FormData) {
  return {
    companyId: formData.get("company_id") || null,
    name: formData.get("name"),
    status: formData.get("status") || "active",
    description: formData.get("description") || null,
  };
}

export async function createProject(formData: FormData) {
  const parsed = projectSchema.safeParse(projectInputFromForm(formData));
  if (!parsed.success) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();
  const { data, error } = await db
    .from("projects")
    .insert({
      organization_id: orgId,
      company_id: parsed.data.companyId,
      name: parsed.data.name,
      status: parsed.data.status,
      description: parsed.data.description,
    })
    .select("id")
    .single();
  if (error || !data) return;
  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

export async function updateProject(id: string, formData: FormData) {
  const parsed = projectSchema.safeParse(projectInputFromForm(formData));
  if (!parsed.success) return;

  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db
    .from("projects")
    .update({
      company_id: parsed.data.companyId,
      name: parsed.data.name,
      status: parsed.data.status,
      description: parsed.data.description,
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
