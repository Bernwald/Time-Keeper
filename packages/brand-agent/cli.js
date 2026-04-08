#!/usr/bin/env node
// Brand-Agent CLI
//
// Lokal laufender Coding-Agent, der aus TimeKeeper-Daten brandkonforme
// Briefings (HTML, optional PPTX) erstellt. Nutzt:
//   * /functions/v1/brand-manifest    → Brand Guidelines + AI-Settings
//   * /functions/v1/chat-search       → Hybrid-Suche (oder direkter REST-Zugriff)
//
// Setup:
//   cp .env.example .env
//   npm install
//   node cli.js briefing "Vertriebskontakte Q1"
//
// Architektur ist absichtlich schlank: Ein Tool-Aufruf holt die Brand-Guides,
// ein zweiter holt Daten via Search-Endpoint, dann rendert ein HTML-Template
// die Ergebnisse in CI-konformes Markup. Erweitern fuer PPTX/Docx via Skills.

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const SUPABASE_URL  = process.env.TIMEKEEPER_SUPABASE_URL;
const USER_TOKEN    = process.env.TIMEKEEPER_USER_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OUT_DIR       = process.env.BRAND_AGENT_OUT ?? "./out";

if (!SUPABASE_URL || !USER_TOKEN || !ANTHROPIC_KEY) {
  console.error(
    "Fehlende Env-Variablen. Erwartet: TIMEKEEPER_SUPABASE_URL, TIMEKEEPER_USER_TOKEN, ANTHROPIC_API_KEY",
  );
  process.exit(1);
}

const [, , command, ...rest] = process.argv;
const topic = rest.join(" ").trim();

if (command !== "briefing" || !topic) {
  console.log("Usage: brand-agent briefing \"<thema>\"");
  process.exit(1);
}

async function fetchBrandManifest() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/brand-manifest`, {
    headers: { Authorization: `Bearer ${USER_TOKEN}` },
  });
  if (!res.ok) throw new Error(`brand-manifest: ${res.status}`);
  return res.json();
}

// Direkter REST-Aufruf gegen die `sources` View. Ersetzt einen Search-
// Endpoint, solange noch keine separate API existiert. Liest mit User-Token,
// also greifen die RLS-Policies des Aufrufers.
async function queryPlatform(query) {
  const url =
    `${SUPABASE_URL}/rest/v1/sources` +
    `?select=id,title,raw_text,source_type` +
    `&or=(title.ilike.*${encodeURIComponent(query)}*,raw_text.ilike.*${encodeURIComponent(query)}*)` +
    `&limit=20`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${USER_TOKEN}`,
      apikey: USER_TOKEN,
    },
  });
  if (!res.ok) throw new Error(`queryPlatform: ${res.status}`);
  return res.json();
}

async function main() {
  console.log(`→ Hole Brand Manifest …`);
  const manifest = await fetchBrandManifest();
  console.log(`✓ Org: ${manifest.org.name}`);

  console.log(`→ Hole Daten zu "${topic}" …`);
  const data = await queryPlatform(topic);
  console.log(`✓ ${data.length} Quellen gefunden`);

  console.log(`→ Generiere Briefing mit Claude …`);
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

  const systemPrompt = [
    `Du bist Briefing-Generator fuer ${manifest.org.name}.`,
    `Halte dich strikt an die Brand Guidelines. Erfinde nichts.`,
    `Nutze ausschliesslich die uebergebenen Daten.`,
    manifest.ai?.system_prompt ?? "",
    manifest.branding?.tone_of_voice
      ? `Tone of Voice: ${manifest.branding.tone_of_voice}`
      : "",
  ].filter(Boolean).join("\n\n");

  const userPrompt = [
    `Thema: ${topic}`,
    ``,
    `Brand Guidelines (JSON):`,
    JSON.stringify(manifest.branding, null, 2),
    ``,
    `Quellen (JSON):`,
    JSON.stringify(data, null, 2),
    ``,
    `Erstelle eine vollstaendige, eigenstaendige HTML-Datei (mit <style>, ohne externe Abhaengigkeiten), die als Briefing zu "${topic}" dient. Verwende die Markenfarben und Schriften aus dem Brand-JSON. Strukturiere mit Header (Logo + Titel), Executive Summary, einer Abschnittsliste pro Quelle und Footer. Nutze inline CSS mit den Markenfarben. Gib NUR HTML zurueck, keinen Markdown-Wrap.`,
  ].join("\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const html = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  await fs.mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(
    OUT_DIR,
    `briefing-${topic.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${Date.now()}.html`,
  );
  await fs.writeFile(outPath, html, "utf8");
  console.log(`✓ Geschrieben: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
