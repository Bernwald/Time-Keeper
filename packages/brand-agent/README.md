# @timekeeper/brand-agent

Lokal laufender CLI-Agent, der aus TimeKeeper-Daten brandkonforme Briefings erzeugt.

## Setup

```bash
cd packages/brand-agent
cp .env.example .env
# .env mit Werten füllen
npm install
```

## Nutzung

```bash
node cli.js briefing "Vertriebskontakte Q1"
```

Liest Brand Guidelines via Edge Function `brand-manifest`, holt passende Quellen
über die Supabase REST API (RLS-geschützt mit dem User-Token), schickt alles an
Claude Sonnet und schreibt ein eigenständiges HTML-Briefing nach `./out`.

## Architektur

- `cli.js` – Einstiegspunkt (Argv-Parser)
- `fetchBrandManifest()` – holt `branding`, `ai`-Settings, Org-Metadaten
- `queryPlatform(query)` – ILIKE-Suche über `sources`
- Anthropic-SDK rendert das HTML inline mit den Markenfarben

## Erweitern

- PPTX-Output: Skill `anthropic-skills:pptx` hinzuziehen
- Mehr Datenquellen: `queryPlatform` um Joins mit `companies`/`contacts` ergänzen
- Multi-Step Reasoning: auf `@anthropic-ai/claude-agent-sdk` umstellen

Die sensiblen Tokens bleiben lokal — deshalb läuft der Agent bewusst nicht in
`apps/web`.
