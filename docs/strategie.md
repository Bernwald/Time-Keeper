<!--
  Strategie-Paper hAIway — Single Source of Truth.
  Spiegelt sich in docs/strategie.html (Präsentationsversion). Beide synchron halten.
  Letzte Aktualisierung: 2026-04-09
-->

# hAIway — Strategie

## 1. Nordstern

**hAIway ist ein KI-Betriebssystem für KMU. Wir verkaufen Ergebnisse, keine Software.**

Der Kunde misst uns daran, ob seine manuelle Arbeit abnimmt, seine Prozesse schneller werden und seine Daten endlich miteinander reden — nicht daran, wie viele Features im Tool stecken.

## 2. Was wir bauen — und was nicht

**Wir bauen NICHT selbst:**
- CRM, E-Mail-Marketing, Buchhaltung, ERP, Kalender, Telefonie-Backend
- Große Sprachmodelle oder eigenes LLM-Training
- Generische Bürosoftware, die es schon gut gibt

**Wir bauen SELBST:**
- **Orchestrator** — die Schicht, die fremde Tools des Kunden anbindet, synchronisiert und auditiert
- **Glue-Layer / Workflows** — branchen- und kundenspezifische Automatisierungen zwischen diesen Tools
- **Berater-Cockpit** — wo unser Team (und später der Kunde) konfiguriert, was passieren soll
- **Custom Agents & Prompts** — auf den Kundenkontext zugeschnitten, gespeist aus den synchronisierten Daten
- **Outcome-Reporting** — KPIs, die zeigen, dass die Ergebnisse tatsächlich eintreten

Kurz: Wir bauen die Schicht, die zwischen den Tools fehlt — nicht die Tools selbst.

## 3. Architektur-Prinzipien

1. **Orchestrator + Glue, nie Tool-Klon.** Jede neue Funktion stärkt entweder die Anbindung, die Verarbeitung, das Konfigurieren oder das Messen.
2. **Bronze → Silver → Gold.** Externe Daten landen via `pgmq` in Bronze, werden in Silver normalisiert, in Gold für Agenten und Reporting bereitgestellt. Keine direkten Schreibwege an der Pipeline vorbei.
3. **Auditierbar by default.** Jede Aktion eines Agenten oder Workflows hinterlässt eine Spur (welche Quelle, welcher Prompt, welches Ergebnis). KPI-Tracking ist Pflicht.
4. **Berater-First, Kunde-Second.** Der Berater richtet ein, entscheidet, was sichtbar wird, und überwacht. Der Kunde sieht eine kuratierte Oberfläche.
5. **Multi-Tenant + branchenagnostischer Kern.** Branchen-Spezifika gehören in Konfiguration, Templates und Prompts — nicht in den Code.
6. **Wiederverwendung vor Neuaufbau.** Bestehende Bausteine (`integration_providers`, `sources`, `content_chunks`, `chat_*`, `pgmq`-Worker) sind die Standardpfade.

## 4. Strategische Filterfragen (das Strategy Gate)

Vor jeder nicht-trivialen Aufgabe wird die Aufgabe gegen diese fünf Fragen geprüft:

1. **Orchestrator oder Klon?** Stärkt diese Aufgabe den Orchestrator/Glue — oder bauen wir damit ein fremdes Tool nach?
2. **Ergebnis oder Feature?** Erzeugt sie ein für den Kunden messbares Ergebnis (mit KPI), oder ist sie nur eine zusätzliche Funktion?
3. **Multi-Tenant-fähig?** Funktioniert die Lösung für mehrere Kunden / Branchen — oder ist sie ein One-Off für genau einen Kunden?
4. **Baut sie auf bestehende Bausteine?** Nutzt sie `pgmq`, `integration_providers`, `sources`, `chat_*`, `feature_flags` — oder erfindet sie eine Parallelwelt?
5. **Bleibt der Berater im Lead?** Kann der Berater einrichten, kontrollieren und entscheiden, was der Kunde sieht?

**Wenn auch nur eine Antwort „nein" oder unklar ist → Aufgabe stoppen, bei den Gründern rückfragen.** Lieber einmal nachfragen als drei Tage in die falsche Richtung bauen.

## 5. Roadmap-Slots (Was als Nächstes zur Strategie passt)

- **Connector-Katalog v1** — saubere Trennung zwischen *read-only Sync* (Daten holen) und *write-back / Action* (im Fremdsystem etwas auslösen). Aufsetzend auf `integration_providers`.
- **Berater-Cockpit** — UI zur Pro-Kunden-Konfiguration: welche Quellen, welche Workflows, welche KPIs sind aktiv.
- **Outcome-Templates pro Branche** — vordefinierte Workflow- und Prompt-Pakete (z. B. „Handwerksbetrieb", „Steuerkanzlei"), die der Berater pro Kunde aktiviert.
- **KPI-Dashboard** — pro Kunde sichtbar machen, welche Ergebnisse die Plattform tatsächlich erzeugt hat (Zeiteinsparung, Antwortzeit, Datenqualität).
- **Pricing-Refresh** — Plan-Tiers an Ergebnissen statt an Features ausrichten.

## 6. Anti-Pattern (was wir explizit nicht mehr akzeptieren)

- Eigenes CRM-, Mail- oder Buchhaltungs-UI nachbauen
- Eigenes LLM trainieren oder feinabstimmen
- Features, die nur für einen einzelnen Kunden Sinn ergeben und nicht in den Multi-Tenant-Kern passen
- Datenflüsse an `pgmq`/Bronze-Silver-Gold vorbei
- Agenten ohne Audit-Spur oder ohne KPI
- Funktionen, die der Kunde direkt sieht, ohne dass der Berater sie freigegeben hat
