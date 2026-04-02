# apps/web — Frontend-Details

> Ergänzt Root `CLAUDE.md`. Gilt nur für Arbeit im `apps/web/` Verzeichnis.

## Verzeichnisstruktur

```
src/
  app/
    layout.tsx   Root-Layout
    page.tsx     Startseite
    globals.css  Design-Tokens + Tailwind
```

## Dark Mode

- Aktiv via `prefers-color-scheme` (System-Praeferenz) + `.dark` Klasse auf `<html>`
- Alle Farben via CSS Custom Properties in `globals.css` — Light-Tokens in `:root`, Dark-Tokens im `.dark` Selektor
- **Nie hardcoded Farben** (`#fff`, `#000`, `bg-white`, `text-black` etc.) — immer `var(--color-xxx)` oder Token-Klassen aus `table-classes.ts` verwenden
- Inline-Styles: `style={{ background: "var(--color-panel)" }}` statt `style={{ background: "#fff" }}`
- Neue Features muessen in Light UND Dark funktionieren — keine Farbe ohne Token

## Status

Unbeschriebenes Blatt. Keine Components, keine lib/, keine features/ — alles wird neu aufgebaut.
