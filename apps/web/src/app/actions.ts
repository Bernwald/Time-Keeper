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
  importRowSchema,
  sourceLinkSchema,
  validatePdfFile,
  validateAudioFile,
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


