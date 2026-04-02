import Link from "next/link";
import { getAssistant, listCallLogs, getCallStats } from "@/lib/db/queries/phone-assistant";
import { CALL_STATUS_LABELS, ASSISTANT_STATUS_LABELS } from "@/lib/constants/phone-assistant";
import { card, badge, page, styles } from "@/components/ui/table-classes";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PhoneAssistantDashboard() {
  const [assistant, calls, stats] = await Promise.all([
    getAssistant(),
    listCallLogs(20),
    getCallStats(30),
  ]);

  const statusInfo = assistant
    ? ASSISTANT_STATUS_LABELS[assistant.status] ?? { label: assistant.status, color: "var(--color-muted)" }
    : null;

  return (
    <div className={page.wrapper}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between animate-fade-in">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold" style={styles.title}>
            Telefonassistent
          </h1>
          {assistant && statusInfo && (
            <div className="flex items-center gap-2 mt-1">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ background: statusInfo.color }}
              />
              <span className="text-xs font-medium" style={{ color: statusInfo.color }}>
                {statusInfo.label}
              </span>
              <span className="text-xs" style={styles.muted}>
                — {assistant.name}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/telefon-assistent/einstellungen"
            className="text-xs font-medium px-3 min-h-[44px] inline-flex items-center rounded-xl transition-all"
            style={{ color: "var(--color-accent)", background: "var(--color-accent-soft)" }}
          >
            Einstellungen
          </Link>
          <Link
            href="/telefon-assistent/nummern"
            className="text-xs font-medium px-3 min-h-[44px] inline-flex items-center rounded-xl transition-all"
            style={{ color: "var(--color-muted)", background: "var(--color-bg-elevated)" }}
          >
            Nummern
          </Link>
        </div>
      </div>

      {/* No assistant yet */}
      {!assistant && (
        <div className={`${card.base} text-center py-12 animate-slide-up`} style={styles.panel}>
          <p className="text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
            Noch kein Telefonassistent eingerichtet
          </p>
          <p className="text-xs mb-4" style={styles.muted}>
            Konfigurieren Sie Ihren KI-Telefonassistenten, um Anrufe automatisch zu beantworten.
          </p>
          <Link
            href="/telefon-assistent/einstellungen"
            className="text-xs font-medium px-4 min-h-[44px] inline-flex items-center rounded-xl"
            style={styles.accent}
          >
            Jetzt einrichten
          </Link>
        </div>
      )}

      {/* Stats KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-slide-up">
          <div className={card.base} style={styles.panel}>
            <p className="text-[11px] font-medium uppercase tracking-wide" style={styles.muted}>
              Anrufe (30 Tage)
            </p>
            <p className="text-2xl font-semibold mt-1" style={{ color: "var(--color-text)" }}>
              {stats.total_calls}
            </p>
          </div>
          <div className={card.base} style={styles.panel}>
            <p className="text-[11px] font-medium uppercase tracking-wide" style={styles.muted}>
              Abgeschlossen
            </p>
            <p className="text-2xl font-semibold mt-1" style={{ color: "var(--color-success)" }}>
              {stats.completed_calls}
            </p>
          </div>
          <div className={card.base} style={styles.panel}>
            <p className="text-[11px] font-medium uppercase tracking-wide" style={styles.muted}>
              Verpasst
            </p>
            <p className="text-2xl font-semibold mt-1" style={{ color: "var(--color-warning)" }}>
              {stats.missed_calls}
            </p>
          </div>
          <div className={card.base} style={styles.panel}>
            <p className="text-[11px] font-medium uppercase tracking-wide" style={styles.muted}>
              Durchschnittsdauer
            </p>
            <p className="text-2xl font-semibold mt-1" style={{ color: "var(--color-text)" }}>
              {stats.avg_duration_seconds
                ? formatDuration(Math.round(stats.avg_duration_seconds))
                : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Language split mini-bar */}
      {stats && stats.total_calls > 0 && (
        <div className={`${card.base} animate-slide-up`} style={styles.panel}>
          <p className="text-[11px] font-medium uppercase tracking-wide mb-2" style={styles.muted}>
            Sprachverteilung
          </p>
          <div className="flex gap-3 text-xs">
            <span style={{ color: "var(--color-text)" }}>
              DE: {stats.calls_de} ({Math.round((stats.calls_de / stats.total_calls) * 100)}%)
            </span>
            <span style={{ color: "var(--color-text)" }}>
              EN: {stats.calls_en} ({Math.round((stats.calls_en / stats.total_calls) * 100)}%)
            </span>
            {stats.calls_other > 0 && (
              <span style={styles.muted}>
                Andere: {stats.calls_other}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Recent calls */}
      <div className="flex flex-col gap-3 animate-slide-up">
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          Letzte Anrufe
        </h2>

        {calls.length === 0 ? (
          <div className={`${card.base} text-center py-8`} style={styles.panel}>
            <p className="text-xs" style={styles.muted}>
              Noch keine Anrufe aufgezeichnet.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {calls.map((call) => {
              const statusInfo =
                CALL_STATUS_LABELS[call.status] ?? { label: call.status, color: "var(--color-muted)" };
              return (
                <Link
                  key={call.id}
                  href={`/telefon-assistent/anrufe/${call.id}`}
                  className={card.hover}
                  style={styles.panel}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>
                          {call.caller_number ?? "Unbekannt"}
                        </span>
                        <span
                          className={badge.base}
                          style={{ background: `${statusInfo.color}15`, color: statusInfo.color }}
                        >
                          {statusInfo.label}
                        </span>
                        {call.detected_language && (
                          <span className="text-[10px] font-medium uppercase" style={styles.muted}>
                            {call.detected_language}
                          </span>
                        )}
                      </div>
                      {call.summary && (
                        <p className="text-xs mt-0.5 truncate" style={styles.muted}>
                          {call.summary}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs" style={styles.muted}>
                        {formatDate(call.started_at)}
                      </p>
                      <p className="text-xs font-medium" style={{ color: "var(--color-text)" }}>
                        {formatDuration(call.duration_seconds)}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
