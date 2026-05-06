# TimeKeeper — AI Foundation Platform

## Projekt

Wiederverwendbare AI Foundation Platform. Eigenes Startup = erster Tenant. Gleiches Datenmodell später für externe Kunden. Ziel: standardisiertes Betriebsmodell für KI-fähige Unternehmensdaten.

**Infra:** GitHub · Supabase (DB + Auth + Storage) · Vercel (Hosting)

## Stack

| Schicht | Technologie |
|---------|-------------|
| Runtime | Next.js 16 (App Router, Server Components, Server Actions) |
| UI | React 19, TypeScript 5.9 |
| Styling | Tailwind v4 + CSS-Tokens in `globals.css` |
| DB | Supabase PostgreSQL + pgvector + RLS |
| Storage | Supabase Storage (Bucket `source-files`) |
| Validation | Zod 4 |
| Monorepo | npm workspaces (`apps/web`) |

## Regeln (nicht verhandelbar)

1. **Lokales Testen Pflicht** — TypeCheck + Lint vor jedem Push. Build + Dev-Server bei Bedarf. Production nur via PR-Merge nach `main`. **Niemals direkt auf `main` pushen.**
2. **Tokens only + Dark Mode** — Farben/Radii nur aus `globals.css`. Keine Ad-hoc-Farben (`#fff`, `bg-white` etc.). Dark Mode ist aktiv — alle neuen Features müssen mit Light- und Dark-Tokens funktionieren.
3. **Mobile-first ab 360px** — Breakpoints: `md:` 768px · `lg:` 1024px. Kein horizontaler Scroll.
4. **Touch: 44px** — `min-h-[44px] min-w-[44px]` auf allen interaktiven Elementen.
5. **Safe Area** — Bottom-Elemente: `pb-[env(safe-area-inset-bottom)]`
6. **UI-Texte Deutsch**, Code + Kommentare Englisch.
7. **DB-Änderungen** nur via `supabase/migrations/` mit RLS.
8. **Business-Logik** in DB-Functions / Edge Functions, nicht in der App.
9. **Card-Radius: `rounded-xl`** (16px). `rounded-2xl` nur für Modals/Bottom-Sheets.

## Strategy Gate (Pflicht vor jeder Plan-/Implementierungsphase)

Vor Planung oder Umsetzung jeder nicht-trivialen Aufgabe:

1. `docs/strategie.md` lesen.
2. Aufgabe gegen die fünf **Strategischen Filterfragen** prüfen (Orchestrator-vs-Klon · Ergebnis-vs-Feature · Multi-Tenant-fähig · baut auf bestehende Bausteine · Berater im Lead).
3. Wenn die Aufgabe **klar passt** → normal weitermachen und im Plan einen kurzen Abschnitt **Strategy Fit** (1–2 Sätze) ergänzen, der begründet warum.
4. Wenn die Aufgabe **nicht klar passt oder widerspricht** → NICHT bauen. Stattdessen den User per Rückfrage konfrontieren: welcher Teil der Strategie ist betroffen, welche Alternativen gibt es.

Trivial = Bugfix, Typo, Style-Token-Korrektur, reine Doku-Edits. Alles andere durchläuft das Gate.

## Deployment — Workflow

**Grundprinzip:** Ein Feature = ein Branch = ein Worktree = ein PR = eine Vercel-Preview.
`main` ist heilig — dort landet Code ausschliesslich per PR-Merge nach User-Freigabe.

### Worktree-Konvention

- Hauptrepo (`C:\Users\thoma\Desktop\Coding\Time keeper`) bleibt **immer auf `main`**.
- Pro Feature ein eigener Worktree unter:
  `C:\Users\thoma\Desktop\Coding\Time keeper.worktrees\<branch-name>`
- Branch-Naming: `feature/<kurz-name>` · `fix/<kurz-name>` · `chore/<kurz-name>`
- Worktree-Lifecycle:
  ```
  git worktree add ../Time\ keeper.worktrees/<branch> -b <branch> origin/main
  # ... arbeiten, committen, pushen, PR mergen ...
  git worktree remove ../Time\ keeper.worktrees/<branch>
  git branch -d <branch>
  ```
- Bei jedem neuen Feature fragt Claude den User: *"Neuer Worktree fuer dieses Feature?"* — und legt ihn nur nach Bestaetigung an.

### Entwicklung (Claude fuehrt aus)

1. **Worktree + Feature-Branch anlegen** (ausserhalb des Hauptrepos, von `origin/main`).
2. **Code schreiben + aendern** im Worktree.
3. **Qualitaetspruefung (Pflicht vor jedem Push):**
   - `npm run typecheck --workspace apps/web`
   - `npm run lint --workspace apps/web`
   - Bei groesseren Aenderungen: `npm run build --workspace apps/web`
   - Bei UI-Aenderungen: Dev-Server starten + Preview-Tools fuer visuelle Pruefung
   - Security-Check
4. **Commit + Push auf den Feature-Branch** (`git push -u origin <branch>`). **Niemals auf `main`.**
5. **PR oeffnen** via `gh pr create --base main` mit Titel + kurzer Test-Plan-Checkliste.
6. **Vercel Preview-URL** (von Vercel automatisch pro PR) an den User melden.
7. **User testet Preview** → gibt Freigabe oder Feedback.
8. Bei Feedback: zurueck zu Schritt 2 im selben Worktree.
9. **Nach User-Freigabe:** PR mergen (Squash empfohlen) → Vercel deployt automatisch nach Production.
10. **Aufraeumen:** Worktree entfernen, lokalen Branch loeschen, im Hauptrepo `git pull` auf `main`.

### Supabase (separater Lifecycle)

- `supabase db push` und `supabase functions deploy` **nur nach expliziter User-Freigabe** und i. d. R. **erst nach PR-Merge**, weil sie auf die Prod-DB wirken.
- Migrations (`supabase/migrations/*.sql`) liegen im Feature-Branch und werden mit dem Code reviewed. Apply gegen Prod ist ein bewusster, separater Schritt.

## Sprachrichtlinie

- **UI-Texte** (Labels, Buttons, Platzhalter, Fehler): **Deutsch**
- **Code** (Variablen, Funktionen, Typen, Kommentare): **Englisch**
- `html lang="de"` im Root Layout

## Env-Variablen

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DEFAULT_ORGANIZATION_SLUG=time-keeper
NEXT_PUBLIC_APP_URL=
```

## Sub-Dokumentation

- **Strategie / Nordstern** → `docs/strategie.md` (Pflichtlektüre via Strategy Gate · Präsentationsversion: `docs/strategie.html`)
- **Frontend-Details** → `apps/web/CLAUDE.md`
- **Datenbank / Migrations** → `supabase/CLAUDE.md`
