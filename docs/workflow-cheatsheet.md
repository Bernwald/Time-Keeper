# Workflow-Cheatsheet — Was du als Thomas konkret tust

Schnell-Referenz fuer den Branch/PR/Vercel-Workflow. Zielgruppe: du.
Claude folgt dem hier hinterlegten Prozess. Wenn etwas in der Praxis abweicht
oder nervt — rein hier reinschreiben (oder mir sagen), nicht im Kopf merken.

## 1. Die zwei Konzepte, die am meisten verwirren

### Code vs. Daten

**Code** ist pro Branch unterschiedlich — `main`, `feature/xyz`, lokales
Worktree haben jeweils eigenen Code-Stand.
**Daten** liegen alle in **einer** Supabase-Produktions-DB. Es gibt keine
Preview-DB und keine lokale DB. Was du wo anlegst, sehen alle Stande.

```
                        ┌──────────────────┐
                        │   SUPABASE       │  ← EINE Datenbank
                        │  (Produktions-DB)│    fuer ALLE Staende
                        └─────────▲────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
            ┌───────▼─────┐ ┌─────▼────┐ ┌─────▼─────┐
            │ PRODUCTION  │ │ PREVIEW  │ │  LOCAL    │
            │             │ │          │ │           │
            │ time-keeper │ │ ...git-  │ │  Port     │
            │ -ruby...    │ │ feature- │ │  3000 /   │
            │             │ │ xyz...   │ │  3xxx     │
            └─────────────┘ └──────────┘ └───────────┘
                  ▲              ▲              ▲
                  │              │              │
            ┌─────────────┐ ┌──────────────┐
            │ GitHub:main │ │ GitHub:      │
            │             │ │ feature/xyz  │
            └─────────────┘ └──────────────┘
```

**Konsequenz:** Solange ein Feature im Feature-Branch ist, fehlt es auf
der Production-URL — aber die Daten, die du auf der Preview-URL erzeugst,
sind sofort auch in Production sichtbar.

### Login-Cookies sind pro Domain

Auf der Preview-URL eingeloggt → auf Production trotzdem ausgeloggt
(und umgekehrt). Auf jeder Domain einmal frisch einloggen.

## 2. Dein Schritt-fuer-Schritt-Ablauf

```
 1. Claude meldet: "PR #N offen, Preview: https://...vercel.app"
                                ▼
 2. Du oeffnest die Preview-URL im Browser
                                ▼
 3. Du loggst dich ein (dein normaler Account, echte Daten)
                                ▼
 4. Du klickst durch: Feature ok? Light/Dark? Mobile?
                                ▼
        ┌──────────────────────┴──────────────────────┐
        │                                             │
      GUT                                       NICHT GUT
        │                                             │
        ▼                                             ▼
 5a. Auf GitHub im PR:                      5b. Du sagst Claude was zu fixen
     gruener Button "Squash and merge"          ist
                                                ▼
                                            6b. Claude pusht Fix in den
                                                gleichen Branch
        ▼                                       ▼
 6a. Vercel deployt main → Production       7b. Dieselbe Preview-URL
     (~90 sec, automatisch)                     aktualisiert sich
                                                ▼
        ▼                                   Zurueck zu Schritt 4
 7a. Production hat jetzt das Feature
        ▼
 8a. Claude raeumt Worktree + Branch auf
     (Auto-Cleanup nach Merge — du
      musst nichts tun)
```

## 3. URLs auf einen Blick

| URL | Code von | Daten |
|---|---|---|
| `time-keeper-ruby.vercel.app` (**Production**) | `main`-Branch | Prod-DB |
| `time-keeper-git-feature-xyz-…vercel.app` (**Preview**, pro PR) | jeweiliger Feature-Branch | Prod-DB (gleiche!) |
| `localhost:3000` | `main` aus deinem Hauptrepo | Prod-DB |
| `localhost:3375` (oder andere 3100–3999) | Feature-Branch im Worktree | Prod-DB |

## 4. Haeufige Verwirrungen — und was wirklich los ist

| Du erlebst | Was wirklich los ist |
|---|---|
| "Ich logge mich auf Production ein und das neue Feature ist nicht da." | PR ist noch nicht gemerged. → **Preview-URL nutzen** ODER **PR mergen**. |
| "Ich habe auf Preview Daten angelegt — wo sind die jetzt?" | In der Prod-DB. Auch auf Production sofort sichtbar (anderer Login noetig wegen Cookie-Domain). |
| "Vercel sagt 'Building' nach dem Merge — wie lange?" | ~90 Sek bis 2 Min. Solange siehst du auf Production noch den alten Stand. |
| "Ich habe gemerged, aber Production ist noch alt." | Browser-Cache. Hard-Reload (Ctrl+Shift+R). Wenn weiter alt: Vercel-Deploy-Status pruefen. |
| "Mein lokaler Dev-Server zeigt nicht das was Claude macht." | Du bist im Hauptrepo (Port 3000) auf `main`. Claude arbeitet im **Worktree** auf einem anderen Port (3100–3999). |

## 5. Was DU als User aktiv tust (Minimal-Liste)

1. **Preview-URL oeffnen + testen** wenn Claude einen PR meldet
2. **"Squash and merge"** auf GitHub klicken, wenn die Preview gut ist
3. **Anthropic-Key** lokal nachtragen, falls Chat-Features lokal getestet werden sollen

Alles andere (Worktree anlegen, npm install, Branch loeschen, Vercel-Deploy
triggern, Tests laufen lassen, ...) macht Claude oder die Plattform automatisch.

## 6. Spickzettel fuer GitHub

```
PR oeffnen:           Claude macht das via `gh pr create`
PR review:            https://github.com/Bernwald/Time-Keeper/pulls
PR mergen:            Im PR oben rechts → "Squash and merge" → bestaetigen
Branch loeschen:      Geht automatisch beim Squash-Merge mit "Delete branch"
                      (oder Claude raeumt es im Cleanup-Step auf)
```

## 7. Spickzettel fuer Vercel

```
Production-Deploy-Status:  https://vercel.com/thomas-3505s-projects/time-keeper
Preview-Deploys:           Pro PR im PR-Kommentar verlinkt
Env-Variablen:             Project Settings → Environment Variables
                           (Claude pullt sie via `npx vercel env pull` lokal)
Logs:                      Deployment → Functions / Runtime Logs
```

## 8. Wenn was schiefgeht

- **Vercel-Build rot:** Im PR-Check auf "Details" klicken → Build-Logs.
  Sag Claude den Fehler, er fixt im selben Branch.
- **Merge-Konflikt im PR:** Claude rebased im Worktree.
- **Preview funktioniert nicht / Endless Spinner:** Vercel-Funktion-Logs
  pruefen. Oft: fehlende Env-Variable oder Supabase-RLS.
- **Production kaputt nach Merge:** GitHub → Commits → den Merge-Commit
  finden → "Revert"-Button. Vercel rollt automatisch.
