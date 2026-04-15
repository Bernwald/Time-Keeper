# Supabase Auth E-Mail-Templates (TimeKeeper-Branding)

Die HTML-Dateien in diesem Ordner sind **Referenz-Vorlagen** für die Supabase-Auth-E-Mail-Templates. Sie werden **nicht vom Code geladen** — Supabase hält die aktiven Templates im Project-Dashboard vor. Wir versionieren sie hier, damit sie reviewbar und reproduzierbar sind.

## Aktualisieren im Supabase-Dashboard

1. Supabase Dashboard → **Authentication** → **Email Templates**
2. Pro Template (Magic Link, Invite User, Confirm Signup, Reset Password, Change Email Address) den Inhalt der entsprechenden `.html`-Datei einfügen.
3. Subject-Zeile manuell setzen (siehe Kommentar am Anfang jedes Templates).
4. Speichern und mit **Send Test Email** prüfen.

## Verfügbare Template-Variablen (Supabase)

| Variable | Beispiel |
|---|---|
| `{{ .ConfirmationURL }}` | Vollständiger Klick-Link inkl. Token — **Haupt-CTA** |
| `{{ .SiteURL }}` | Site-URL aus Supabase-Einstellungen |
| `{{ .Email }}` | E-Mail-Adresse des Empfängers |
| `{{ .Token }}` | 6-stelliger OTP-Code |
| `{{ .TokenHash }}` | Hash des Tokens (für eigene Callback-URLs) |
| `{{ .Data.full_name }}` | User-Metadata aus `signUp({ options: { data: ... } })` |

## Design-Konventionen

- Table-basiertes Layout (Outlook-kompatibel), max 600px Breite.
- Farben hart kodiert als Hex (keine CSS-Variablen — Mail-Clients ignorieren sie).
- TK-Akzentfarbe: `#0d9488` (Teal, light) / `#14b8a6` (teal-500, dark).
- Dark-Mode per `@media (prefers-color-scheme: dark)` — greift in Apple Mail, Gmail iOS/Android, Outlook iOS. Outlook Desktop bleibt im Light-Mode (akzeptabel).
- Kein externes Bild-Asset — Logo ist Text-Rendered in einer `<div>` mit Teal-Hintergrund.
- Footer enthält Impressum-Link + Absender-Hinweis.

## Checkliste nach Template-Änderungen

- [ ] Test-Mail an eigene Adresse + an Gmail/Apple/Outlook-Konto senden.
- [ ] Visuell prüfen: Light + Dark (System-Theme umschalten beim Öffnen).
- [ ] Klick-Ziel prüfen (Magic-Link loggt korrekt ein).
- [ ] Spam-Test: https://www.mail-tester.com/
