# supabase — Datenbank-Details

> Ergänzt Root `CLAUDE.md`. Gilt nur für Arbeit im `supabase/` Verzeichnis.

## Migrations-Konventionen

- Dateiname: `YYYYMMDDHHMMSS_beschreibung.sql`
- Immer RLS aktivieren: `ALTER TABLE x ENABLE ROW LEVEL SECURITY;`
- Zugriff via Funktion: `is_member_of_org(organization_id)`
- Service-Role-Client umgeht RLS (serverseitig OK, Browser = nie)

## Schema-Struktur

Noch keine Tabellen. Unbeschriebenes Blatt.

## RLS-Pattern (Standard)

```sql
-- Enable
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Read
CREATE POLICY "org members read" ON table_name
  FOR SELECT USING (is_member_of_org(organization_id));

-- Write
CREATE POLICY "org members write" ON table_name
  FOR ALL USING (is_member_of_org(organization_id));
```
