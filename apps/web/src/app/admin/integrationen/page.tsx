import { createServiceClient } from "@/lib/db/supabase-server";
import { replayJobFailureAction } from "./actions";

export const dynamic = "force-dynamic";

interface RunRow {
  id:              string;
  organization_id: string;
  provider_id:     string;
  status:          string;
  trigger:         string;
  started_at:      string;
  finished_at:     string | null;
  duration_ms:     number | null;
  records_in:      number;
  records_ok:      number;
  records_failed:  number;
  error_message:   string | null;
}

interface FailureRow {
  id:              string;
  organization_id: string;
  provider_id:     string | null;
  queue_name:      string;
  error_message:   string;
  attempt_count:   number;
  failed_at:       string;
  replayed_at:     string | null;
}

interface KpiRow {
  organization_id:      string;
  provider_id:          string;
  day:                  string;
  run_count:            number;
  success_count:        number;
  failed_count:         number;
  records_in_total:     number;
  records_ok_total:     number;
  records_failed_total: number;
  avg_duration_ms:      number;
}

export default async function IntegrationsAdminPage() {
  const supabase = createServiceClient();

  const [{ data: runs }, { data: failures }, { data: kpis }] = await Promise.all([
    supabase
      .from("integration_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50),
    supabase
      .from("job_failures")
      .select("*")
      .is("replayed_at", null)
      .order("failed_at", { ascending: false })
      .limit(50),
    supabase
      .from("integration_kpi_daily")
      .select("*")
      .order("day", { ascending: false })
      .limit(14),
  ]);

  const runRows:     RunRow[]     = (runs     ?? []) as RunRow[];
  const failureRows: FailureRow[] = (failures ?? []) as FailureRow[];
  const kpiRows:     KpiRow[]     = (kpis     ?? []) as KpiRow[];

  const totals = kpiRows.reduce(
    (acc, k) => ({
      runs:    acc.runs    + k.run_count,
      success: acc.success + k.success_count,
      failed:  acc.failed  + k.failed_count,
      records: acc.records + k.records_ok_total,
    }),
    { runs: 0, success: 0, failed: 0, records: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Läufe (14 T.)"     value={totals.runs} />
        <StatCard label="Erfolgreich"       value={totals.success} />
        <StatCard label="Fehlgeschlagen"    value={totals.failed} tone="warn" />
        <StatCard label="Records verarbeitet" value={totals.records} />
      </div>

      {/* Recent runs */}
      <Panel title="Letzte Sync-Läufe">
        {runRows.length === 0 ? (
          <Empty text="Noch keine Sync-Läufe." />
        ) : (
          <ul className="flex flex-col gap-2">
            {runRows.map((r) => (
              <li
                key={r.id}
                className="rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 min-h-[44px]"
                style={{ background: "var(--color-bg)" }}
              >
                <StatusPill status={r.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>
                    {r.provider_id}
                  </div>
                  <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {new Date(r.started_at).toLocaleString("de-DE")} · {r.trigger}
                  </div>
                </div>
                <div className="text-xs flex gap-3" style={{ color: "var(--color-muted)" }}>
                  <span>{r.records_ok}/{r.records_in} ok</span>
                  {r.records_failed > 0 && <span>{r.records_failed} Fehler</span>}
                  {r.duration_ms !== null && <span>{r.duration_ms} ms</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Dead letters */}
      <Panel title="Fehlgeschlagene Jobs (DLQ)">
        {failureRows.length === 0 ? (
          <Empty text="Keine offenen Fehler." />
        ) : (
          <ul className="flex flex-col gap-2">
            {failureRows.map((f) => (
              <li
                key={f.id}
                className="rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4"
                style={{ background: "var(--color-bg)" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                    {f.provider_id ?? "—"} · {f.queue_name}
                  </div>
                  <div
                    className="text-xs truncate"
                    style={{ color: "var(--color-muted)" }}
                    title={f.error_message}
                  >
                    {f.error_message}
                  </div>
                  <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {new Date(f.failed_at).toLocaleString("de-DE")} · Versuch {f.attempt_count}
                  </div>
                </div>
                <form action={replayJobFailureAction}>
                  <input type="hidden" name="failure_id" value={f.id} />
                  <button
                    type="submit"
                    className="min-h-[44px] min-w-[44px] px-4 rounded-lg text-sm font-medium"
                    style={{
                      background: "var(--color-accent-soft)",
                      color:      "var(--color-accent)",
                    }}
                  >
                    Erneut ausführen
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
    >
      <h2
        className="text-base font-semibold mb-4"
        style={{ color: "var(--color-text)" }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
    >
      <p className="text-sm" style={{ color: "var(--color-muted)" }}>{label}</p>
      <p
        className="text-3xl font-semibold mt-1"
        style={{
          fontFamily: "var(--font-display)",
          color: tone === "warn" && value > 0 ? "var(--color-danger)" : "var(--color-text)",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "success" ? "var(--color-accent)"  :
    status === "partial" ? "var(--color-warning)" :
    status === "failed"  ? "var(--color-danger)"  :
                           "var(--color-muted)";
  const bg =
    status === "success" ? "var(--color-accent-soft)" :
                           "var(--color-bg-elevated)";
  return (
    <span
      className="text-xs px-2 py-1 rounded-full font-medium"
      style={{ background: bg, color: tone }}
    >
      {status}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="text-sm" style={{ color: "var(--color-muted)" }}>{text}</p>
  );
}
