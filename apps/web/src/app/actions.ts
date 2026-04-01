"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient, DEFAULT_ORG_ID } from "@/lib/db/supabase";
import { splitIntoChunks } from "@/lib/content/chunker";
import { countWords, extractTextFromPdf } from "@/lib/content/extractor";
import { embedText } from "@/lib/ai/embeddings";

// ─── SOURCES ──────────────────────────────────────────────────────────────

async function storeChunks(sourceId: string, text: string) {
  const db = createServiceClient();
  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) return;

  // Generate embeddings in parallel (graceful: null if no API key)
  const embeddings = await Promise.all(chunks.map((c) => embedText(c.chunkText)));

  const rows = chunks.map((c, i) => ({
    organization_id: DEFAULT_ORG_ID,
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

  const db = createServiceClient();
  const { data, error } = await db
    .from("sources")
    .insert({
      organization_id: DEFAULT_ORG_ID,
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

  await storeChunks(data.id, rawText);
  await db.from("sources").update({ status: "ready" }).eq("id", data.id);

  revalidatePath("/sources");
  redirect(`/sources/${data.id}`);
}

export async function createTranscriptSource(formData: FormData) {
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const rawText = formData.get("raw_text") as string;

  if (!title?.trim() || !rawText?.trim()) return;

  const db = createServiceClient();
  const { data, error } = await db
    .from("sources")
    .insert({
      organization_id: DEFAULT_ORG_ID,
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

  await storeChunks(data.id, rawText);
  await db.from("sources").update({ status: "ready" }).eq("id", data.id);

  revalidatePath("/sources");
  redirect(`/sources/${data.id}`);
}

export async function createPdfSource(formData: FormData) {
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const file = formData.get("file") as File | null;

  if (!title?.trim() || !file) return;

  const db = createServiceClient();

  // Upload to Supabase Storage
  const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const storagePath = `${DEFAULT_ORG_ID}/${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await db.storage
    .from("source-files")
    .upload(storagePath, buffer, { contentType: file.type });

  if (uploadError) return;

  // Create source record
  const { data, error } = await db
    .from("sources")
    .insert({
      organization_id: DEFAULT_ORG_ID,
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
    await storeChunks(data.id, text);
  }

  await db.from("sources").update({ status: "ready" }).eq("id", data.id);

  revalidatePath("/sources");
  redirect(`/sources/${data.id}`);
}

// ─── SOURCE LINKS ────────────────────────────────────────────────────

export async function addSourceLink(sourceId: string, linkedType: string, linkedId: string) {
  if (!sourceId || !linkedType || !linkedId) return;
  const db = createServiceClient();
  await db.from("source_links").upsert(
    {
      organization_id: DEFAULT_ORG_ID,
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
  const db = createServiceClient();
  await db.from("content_chunks").delete().eq("source_id", id);
  await db.from("source_links").delete().eq("source_id", id);
  await db.from("sources").delete().eq("id", id).eq("organization_id", DEFAULT_ORG_ID);
  revalidatePath("/sources");
  redirect("/sources");
}

// ─── COMPANIES ────────────────────────────────────────────────────────────

export async function createCompany(formData: FormData) {
  const db = createServiceClient();
  const { data, error } = await db
    .from("companies")
    .insert({
      organization_id: DEFAULT_ORG_ID,
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
    .eq("organization_id", DEFAULT_ORG_ID);
  revalidatePath(`/companies/${id}`);
  revalidatePath("/companies");
  redirect(`/companies/${id}`);
}

export async function deleteCompany(id: string) {
  const db = createServiceClient();
  await db.from("companies").delete().eq("id", id).eq("organization_id", DEFAULT_ORG_ID);
  revalidatePath("/companies");
  redirect("/companies");
}

// ─── CONTACTS ─────────────────────────────────────────────────────────────

export async function createContact(formData: FormData) {
  const db = createServiceClient();
  const { data, error } = await db
    .from("contacts")
    .insert({
      organization_id: DEFAULT_ORG_ID,
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
    .eq("organization_id", DEFAULT_ORG_ID);
  revalidatePath(`/contacts/${id}`);
  revalidatePath("/contacts");
  redirect(`/contacts/${id}`);
}

export async function deleteContact(id: string) {
  const db = createServiceClient();
  await db.from("contacts").delete().eq("id", id).eq("organization_id", DEFAULT_ORG_ID);
  revalidatePath("/contacts");
  redirect("/contacts");
}

// ─── PROJECTS ─────────────────────────────────────────────────────────────

export async function createProject(formData: FormData) {
  const db = createServiceClient();
  const { data, error } = await db
    .from("projects")
    .insert({
      organization_id: DEFAULT_ORG_ID,
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
    .eq("organization_id", DEFAULT_ORG_ID);
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  redirect(`/projects/${id}`);
}

export async function deleteProject(id: string) {
  const db = createServiceClient();
  await db.from("projects").delete().eq("id", id).eq("organization_id", DEFAULT_ORG_ID);
  revalidatePath("/projects");
  redirect("/projects");
}
