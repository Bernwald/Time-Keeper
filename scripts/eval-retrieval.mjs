#!/usr/bin/env node
// Standalone retrieval eval runner.
//
// Purpose: prove that the chat retrieval pipeline returns (nearly) the same
// top-K source IDs for semantically-equivalent query pairs. We can't reuse
// the Next.js server actions directly here — the App Router glue they rely
// on only exists in a request context — so this script re-implements the
// essentials against the same public RPCs (hybrid_search_chunks) and the
// same Anthropic/OpenAI models.
//
// Usage:
//   node scripts/eval-retrieval.mjs --pairs eval/query-pairs.json [--no-expand] [--k 10]
//
// Required env (loaded from apps/web/.env.local if present):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   DEFAULT_ORGANIZATION_SLUG (or --org-slug)
//   OPENAI_API_KEY or OPENAI_RESEARCH_TIMEKEEPER_KEY
//   ANTHROPIC_API_KEY (optional; without it, expansion is a no-op)

import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

// Minimal .env loader — avoids adding a dotenv dep just for an eval script.
// Parses KEY=VALUE lines, strips surrounding quotes, ignores comments and
// empties. Does NOT overwrite values already present in process.env.
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(resolve(process.cwd(), "apps/web/.env.local"));
loadEnvFile(resolve(process.cwd(), "apps/web/.env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const args = parseArgs(process.argv.slice(2));
const PAIRS_PATH = args.pairs ?? "eval/query-pairs.json";
const TOP_K = Number(args.k ?? 10);
const WITH_EXPAND = args["no-expand"] !== true;
const ORG_SLUG = args["org-slug"] ?? process.env.DEFAULT_ORGANIZATION_SLUG ?? "time-keeper";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_RESEARCH_TIMEKEEPER_KEY ?? process.env.OPENAI_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Copy apps/web/.env.local or export them before running.");
  process.exit(1);
}
if (!OPENAI_KEY) {
  console.error("Missing OPENAI_API_KEY / OPENAI_RESEARCH_TIMEKEEPER_KEY — needed for embeddings.");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const { default: OpenAI } = await import("openai");
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// Resolve org id from slug (the RPCs expect a UUID).
const { data: orgRow, error: orgErr } = await db
  .from("organizations")
  .select("id, slug")
  .eq("slug", ORG_SLUG)
  .maybeSingle();
if (orgErr || !orgRow) {
  console.error(`Could not find organization with slug "${ORG_SLUG}":`, orgErr?.message);
  process.exit(1);
}
const ORG_ID = orgRow.id;

console.log(`Eval config: org=${ORG_SLUG} (${ORG_ID}), topK=${TOP_K}, expansion=${WITH_EXPAND}`);

// ─── helpers ──────────────────────────────────────────────────────────────

async function embed(text) {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return res.data[0].embedding;
}

async function expandQuery(question) {
  if (!WITH_EXPAND || !ANTHROPIC_KEY) return [question];
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content:
            `Formuliere die folgende Frage in 3 semantisch gleichwertigen Varianten um. Antworte NUR als JSON-Array mit exakt 3 Strings, ohne Markdown.\n\nFrage: "${question}"`,
        },
      ],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [question];
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [question];
    const seen = new Set([question.toLowerCase()]);
    const out = [question];
    for (const v of arr) {
      if (typeof v !== "string") continue;
      const key = v.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(v.trim());
      if (out.length >= 4) break;
    }
    return out;
  } catch (e) {
    console.warn("expandQuery failed, falling back to single variant:", e.message);
    return [question];
  }
}

async function hybridSearchOne(query, limit) {
  const embedding = await embed(query);
  const { data, error } = await db.rpc("hybrid_search_chunks", {
    p_org_id: ORG_ID,
    p_query: query,
    p_embedding: JSON.stringify(embedding),
    p_limit: limit,
    p_user_id: null,
  });
  if (error) throw error;
  return data ?? [];
}

// RRF fusion — same formula as apps/web/src/app/chat/actions.ts.
function fuseRRF(lists, k = 60) {
  const scoreById = new Map();
  const rowById = new Map();
  for (const list of lists) {
    list.forEach((row, idx) => {
      const score = 1 / (k + idx + 1);
      scoreById.set(row.id, (scoreById.get(row.id) ?? 0) + score);
      if (!rowById.has(row.id)) rowById.set(row.id, row);
    });
  }
  return [...rowById.entries()]
    .map(([id, row]) => ({ ...row, _fused: scoreById.get(id) }))
    .sort((a, b) => b._fused - a._fused);
}

async function retrieve(question, limit) {
  const variants = await expandQuery(question);
  const perVariant = await Promise.all(variants.map((v) => hybridSearchOne(v, limit)));
  const fused = fuseRRF(perVariant).slice(0, limit);
  return { variants, sourceIds: fused.map((r) => r.source_id), chunkIds: fused.map((r) => r.id) };
}

function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const x of setA) if (setB.has(x)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}

// ─── main ─────────────────────────────────────────────────────────────────

const raw = await readFile(resolve(process.cwd(), PAIRS_PATH), "utf8");
const pairs = JSON.parse(raw);
if (!Array.isArray(pairs)) {
  console.error(`${PAIRS_PATH} must be a JSON array of { a, b } pairs.`);
  process.exit(1);
}

const rows = [];
for (const pair of pairs) {
  const a = await retrieve(pair.a, TOP_K);
  const b = await retrieve(pair.b, TOP_K);
  const sourceJaccard = jaccard(a.sourceIds, b.sourceIds);
  const chunkJaccard = jaccard(a.chunkIds, b.chunkIds);
  rows.push({
    a: pair.a,
    b: pair.b,
    a_variants: a.variants,
    b_variants: b.variants,
    a_sources: a.sourceIds.length,
    b_sources: b.sourceIds.length,
    source_jaccard: sourceJaccard,
    chunk_jaccard: chunkJaccard,
  });
}

console.log("\n=== Retrieval stability report ===\n");
for (const r of rows) {
  const ok = r.source_jaccard >= 0.7 ? "OK " : "LOW";
  console.log(`[${ok}] src=${r.source_jaccard.toFixed(2)} chunk=${r.chunk_jaccard.toFixed(2)}  | a="${r.a}"  b="${r.b}"`);
  if (WITH_EXPAND && (r.a_variants.length > 1 || r.b_variants.length > 1)) {
    console.log(`     a_variants: ${r.a_variants.join(" | ")}`);
    console.log(`     b_variants: ${r.b_variants.join(" | ")}`);
  }
}

const avgSrc = rows.reduce((s, r) => s + r.source_jaccard, 0) / rows.length;
const avgChunk = rows.reduce((s, r) => s + r.chunk_jaccard, 0) / rows.length;
console.log(`\nMean source Jaccard@${TOP_K}: ${avgSrc.toFixed(3)} (target >= 0.70)`);
console.log(`Mean chunk  Jaccard@${TOP_K}: ${avgChunk.toFixed(3)}`);

process.exit(avgSrc >= 0.7 ? 0 : 2);

// ─── arg parser ───────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}
