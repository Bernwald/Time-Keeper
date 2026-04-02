import Link from "next/link";
import { notFound } from "next/navigation";
import { getCallLogById } from "@/lib/db/queries/phone-assistant";
import { CALL_STATUS_LABELS } from "@/lib/constants/phone-assistant";
import { card, badge, page, styles } from "@/components/ui/table-classes";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")} Min.`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const call = await getCallLogById(id);
  if (!call) notFound();

  const statusInfo =
    CALL_STATUS_LABELS[call.status] ?? { label: call.status, color: "var(--color-muted)" };

  return (
    <div className={page.narrow}>
      <Link
        href="/telefon-assistent"
        className="text-xs font-medium inline-block animate-fade-in"
        style={{ color: "var(--color-accent)" }}
      >
        &larr; Alle Anrufe
      </Link>

      <div className="animate-fade-in">
        <div className="flex items-center gap-3">
          <h1 className="text-xl md:text-2xl font-semibold" style={styles.title}>
            {call.caller_number ?? "Unbekannter Anrufer"}
          </h1>
          <span
            className={badge.base}
            style={{ background: `${statusInfo.color}15`, color: statusInfo.color }}
          >
            {statusInfo.label}
          </span>
        </div>
        <p className="text-xs mt-1" style={styles.muted}>
          {formatDateTime(call.started_at)}
        </p>
      </div>

      {/* Meta info */}
      <div className={`${card.base} animate-slide-up`} style={styles.panel}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide" style={styles.muted}>
              Dauer
            </p>
            <p className="text-sm font-medium mt-0.5" style={{ color: "var(--color-text)" }}>
              {formatDuration(call.duration_seconds)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide" style={styles.muted}>
              Sprache
            </p>
            <p className="text-sm font-medium mt-0.5" style={{ color: "var(--color-text)" }}>
              {call.detected_language === "de"
                ? "Deutsch"
                : call.detected_language === "en"
                  ? "Englisch"
                  : call.detected_language ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide" style={styles.muted}>
              Angerufene Nr.
            </p>
            <p className="text-sm font-medium mt-0.5" style={{ color: "var(--color-text)" }}>
              {call.called_number ?? "—"}
            </p>
          </div>
          {call.cost_cents != null && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide" style={styles.muted}>
                Kosten
              </p>
              <p className="text-sm font-medium mt-0.5" style={{ color: "var(--color-text)" }}>
                {(call.cost_cents / 100).toFixed(2)} EUR
              </p>
            </div>
          )}
          {call.contact_id && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide" style={styles.muted}>
                Kontakt
              </p>
              <Link
                href={`/contacts/${call.contact_id}`}
                className="text-sm font-medium mt-0.5 inline-block"
                style={{ color: "var(--color-accent)" }}
              >
                Zum Kontakt &rarr;
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      {call.summary && (
        <div className={`${card.base} animate-slide-up`} style={styles.panel}>
          <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>
            Zusammenfassung
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "var(--color-text)" }}>
            {call.summary}
          </p>
        </div>
      )}

      {/* Transcript */}
      {call.transcript && (
        <div className={`${card.base} animate-slide-up`} style={styles.panel}>
          <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>
            Transkript
          </h2>
          <div
            className="text-sm leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto"
            style={{ color: "var(--color-text)" }}
          >
            {call.transcript}
          </div>
        </div>
      )}

      {/* Links */}
      <div className="flex flex-wrap gap-2 animate-slide-up">
        {call.source_id && (
          <Link
            href={`/sources/${call.source_id}`}
            className="text-xs font-medium px-3 min-h-[44px] inline-flex items-center rounded-xl"
            style={styles.accentSoft}
          >
            Quelle anzeigen
          </Link>
        )}
        {call.activity_id && (
          <Link
            href={`/activities/${call.activity_id}`}
            className="text-xs font-medium px-3 min-h-[44px] inline-flex items-center rounded-xl"
            style={styles.accentSoft}
          >
            Aktivitaet anzeigen
          </Link>
        )}
      </div>
    </div>
  );
}
