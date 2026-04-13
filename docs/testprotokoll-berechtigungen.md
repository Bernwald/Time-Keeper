# Testprotokoll: Dokument-Berechtigungsmodell

**Datum:** 13.04.2026  
**Feature:** Ordner-basierte Berechtigungssteuerung  
**Status:** Bestanden

---

## 1. Setup

### Testbenutzer

| Benutzer | E-Mail | Rolle | Gruppe "Produktion" |
|----------|--------|-------|---------------------|
| Max Produktionsleiter | tkleiter2026@gmail.com | Org-Mitglied | Ja |
| Anna Mitarbeiterin | tkmitarbeiterin2026@gmail.com | Org-Mitglied | Nein |

### Testdaten

| Element | Details |
|---------|---------|
| Berechtigungsgruppe | "Produktion" — Zugriff auf Produktionsdokumente |
| Quellen-Ordner | "Produktionsdaten" — 3 geschuetzte Quellen |
| Geschuetzte Quellen | Calisthenics (20 min), Mobility (taeglich), Delegatis-Austausch |
| Oeffentliche Quellen | 75 Dokumente (ohne Ordner-Zuweisung, fuer alle sichtbar) |

### Berechtigungslogik

- Quellen **ohne** Ordner-Zuweisung: sichtbar fuer alle Org-Mitglieder
- Quellen **mit** Ordner-Zuweisung: nur sichtbar fuer Mitglieder einer berechtigten Gruppe
- Max ist in Gruppe "Produktion" → sieht alles (75 + 3 = 78)
- Anna ist in keiner Gruppe → sieht nur oeffentliche (75)

---

## 2. Test: Admin-UI (Berechtigungsverwaltung)

**Seite:** `/berechtigungen`

### 2a. Uebersicht
- Berechtigungsgruppen: 1 Gruppe "Produktion" angezeigt
- Quellen-Ordner: 1 Ordner "Produktionsdaten" angezeigt
- Buttons "+ Neue Gruppe" und "+ Neuer Ordner" vorhanden

**Ergebnis:** BESTANDEN

### 2b. Gruppen-Details
- Klick auf "Produktion" zeigt Panel "Mitglieder: Produktion"
- Max Produktionsleiter (tkleiter2026@gmail.com) als Mitglied gelistet
- Button "+ Mitglied hinzufuegen" vorhanden

**Ergebnis:** BESTANDEN

### 2c. Ordner-Details
- Klick auf "Produktionsdaten" zeigt:
  - "Zugriff: Produktionsdaten" — Gruppe "Produktion" hat Zugriff
  - "Quellen in: Produktionsdaten" — 3 Quellen gelistet
  - Button zum Entfernen von Quellen aus dem Ordner vorhanden
  - Button "+ Quellen zuordnen" vorhanden

**Ergebnis:** BESTANDEN

---

## 3. Test: Dateien-Seite (RLS-Filterung)

### 3a. Max Produktionsleiter (mit Berechtigung)

- **Dashboard:** 78 Quellen angezeigt
- **Dateien-Seite:** 78 Dateien, 2 Quellen
- Alle 3 geschuetzten Quellen (Calisthenics, Mobility, Delegatis) sichtbar

**Ergebnis:** BESTANDEN

### 3b. Anna Mitarbeiterin (ohne Berechtigung)

- **Dashboard:** 75 Quellen angezeigt (3 weniger als Max!)
- **Dateien-Seite:** 75 Dateien, 2 Quellen
- Die 3 geschuetzten Quellen sind NICHT sichtbar

**Ergebnis:** BESTANDEN

---

## 4. Test: RAG-Suche (Datenbankebene)

### 4a. Zentrale Zugriffsfunktion

```sql
-- Anna darf NICHT auf geschuetzte Quelle zugreifen
user_can_access_source('Calisthenics (20 min)', anna_id) → FALSE

-- Max DARF auf geschuetzte Quelle zugreifen
user_can_access_source('Calisthenics (20 min)', max_id) → TRUE
```

**Ergebnis:** BESTANDEN

### 4b. Volltextsuche (search_chunks)

- **Max sucht "Calisthenics":** 5 Ergebnisse (inkl. geschuetzte Quelle "Calisthenics (20 min)")
- **Anna sucht "Calisthenics":** Ergebnisse enthalten nur oeffentliche Quellen, NICHT "Calisthenics (20 min)"

**Ergebnis:** BESTANDEN

---

## 5. Test: Rueckwaertskompatibilitaet

- Quellen ohne Ordner-Zuweisung (75 Stueck) sind fuer beide User sichtbar
- Bestehendes Verhalten bleibt vollstaendig erhalten
- Kein Breaking Change fuer Organisationen ohne Berechtigungsgruppen

**Ergebnis:** BESTANDEN

---

## 6. Zusammenfassung

| Testfall | Ergebnis |
|----------|----------|
| Admin-UI Uebersicht | BESTANDEN |
| Gruppen-Mitglieder verwalten | BESTANDEN |
| Ordner-Zugriff + Quellen verwalten | BESTANDEN |
| Max sieht 78 Quellen (inkl. geschuetzte) | BESTANDEN |
| Anna sieht 75 Quellen (ohne geschuetzte) | BESTANDEN |
| RAG-Suche filtert nach Berechtigung | BESTANDEN |
| Zentrale Zugriffsfunktion korrekt | BESTANDEN |
| Rueckwaertskompatibilitaet | BESTANDEN |

### Architektur-Highlights

1. **Ordner-basiert:** Berechtigungen werden auf Ordner-Ebene vergeben, nicht pro Dokument
2. **Pilotfaehig:** System ist additiv — ohne Ordner funktioniert alles wie bisher
3. **Kanaluebergreifend:** Gleiche Berechtigungslogik fuer Web-Chat, Telefonassistent und Quellen-UI
4. **Sync-faehig:** Externe Systeme (SharePoint, Google Drive) koennen spaeter Gruppen automatisch synchronisieren

### Onboarding-Workflow (fuer Berater)

1. **Gruppe anlegen** → z.B. "Produktion", "Buchhaltung", "Geschaeftsfuehrung"
2. **Ordner anlegen** → z.B. "Produktionsdaten", "Finanzdokumente"
3. **Gruppen Zugriff geben** → Welche Gruppe darf welchen Ordner sehen
4. **Quellen zuordnen** → Dokumente in die passenden Ordner verschieben
5. **Mitarbeiter zu Gruppen hinzufuegen** → Bei User-Anlage oder nachtraeglich

Dokumente ohne Ordner-Zuweisung bleiben fuer alle sichtbar — perfekt fuer einen schrittweisen Rollout.
