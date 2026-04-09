import { redirect } from "next/navigation";
import { createUserClient, getUser } from "@/lib/db/supabase-server";
import { requireOrgId } from "@/lib/db/org-context";
import { card, btn, page, styles } from "@/components/ui/table-classes";
import { connectSharepoint, connectGdrive, triggerInitialSync } from "./actions";

export const dynamic = "force-dynamic";

type Integration = {
  provider_id: string;
  status: string;
  last_synced_at: string | null;
  config: Record<string, unknown> | null;
};

type SourceRow = {
  id: string;
  title: string;
  connector_type: string;
  sync_status: string;
  last_synced_at: string | null;
  source_url: string | null;
};

const PROVIDER_LABEL: Record<string, string> = {
  sharepoint: "Microsoft SharePoint",
  google_drive: "Google Drive",
};

export default async function QuellenPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const sp = await searchParams;
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await requireOrgId();
  const db = await createUserClient();

  const { data: integrationsRaw } = await db
    .from("organization_integrations")
    .select("provider_id, status, last_synced_at, config")
    .eq("organization_id", orgId)
    .in("provider_id", ["sharepoint", "google_drive"]);
  const integrations = (integrationsRaw ?? []) as Integration[];

  const { data: sourcesRaw } = await db
    .from("sources")
    .select("id, title, connector_type, sync_status, last_synced_at, source_url")
    .eq("organization_id", orgId)
    .in("connector_type", ["sharepoint", "gdrive"])
    .order("last_synced_at", { ascending: false })
    .limit(100);
  const sources = (sourcesRaw ?? []) as SourceRow[];

  const byProvider: Record<string, SourceRow[]> = { sharepoint: [], gdrive: [] };
  for (const s of sources) {
    const key = s.connector_type === "sharepoint" ? "sharepoint" : "gdrive";
    byProvider[key].push(s);
  }

  const sharepointInteg = integrations.find((i) => i.provider_id === "sharepoint");
  const gdriveInteg = integrations.find((i) => i.provider_id === "google_drive");

  return (
    <div className={page.wrapper}>
      <div className={page.header}>
        <h1
          className="text-xl md:text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Quellen
        </h1>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Verbinde SharePoint oder Drive — danach laeuft Delta-Sync alle 5 Minuten
          automatisch. Aenderungen in der Quelle landen ohne Re-Upload im Chat.
        </p>
      </div>

      {sp?.error && (
        <div
          className="rounded-[var(--radius-card)] p-3 text-sm"
          style={{ background: "var(--color-danger-soft, #fee)", color: "var(--color-danger, #c00)" }}
        >
          Fehler: {sp.error}
        </div>
      )}
      {sp?.connected && (
        <div
          className="rounded-[var(--radius-card)] p-3 text-sm"
          style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
        >
          Verbunden: {sp.connected}
        </div>
      )}

      <ConnectorCard
        providerId="sharepoint"
        integration={sharepointInteg}
        files={byProvider.sharepoint}
        connectAction={connectSharepoint}
      />
      <ConnectorCard
        providerId="google_drive"
        integration={gdriveInteg}
        files={byProvider.gdrive}
        connectAction={connectGdrive}
      />
    </div>
  );
}

function ConnectorCard(props: {
  providerId: "sharepoint" | "google_drive";
  integration?: Integration;
  files: SourceRow[];
  connectAction: () => Promise<void>;
}) {
  const { providerId, integration, files } = props;
  const isActive = integration?.status === "active";

  return (
    <div className={card.flat} style={styles.panel}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2
            className="text-base font-semibold"
            style={{ color: "var(--color-text)", fontFamily: "var(--font-display)" }}
          >
            {PROVIDER_LABEL[providerId]}
          </h2>
          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
            Status: {integration?.status ?? "nicht verbunden"} ·{" "}
            {integration?.last_synced_at
              ? `zuletzt ${new Date(integration.last_synced_at).toLocaleString("de-DE")}`
              : "noch nie synchronisiert"}
          </p>
        </div>
        {!isActive ? (
          <form action={props.connectAction}>
            <button type="submit" className={btn.primary} style={styles.accent}>
              Verbinden
            </button>
          </form>
        ) : (
          <form action={triggerInitialSync.bind(null, providerId)}>
            <button type="submit" className={btn.secondary} style={styles.panel}>
              Jetzt synchronisieren
            </button>
          </form>
        )}
      </div>

      {files.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Noch keine Dateien indexiert.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2"
              style={{ background: "var(--color-bg-elevated)" }}
            >
              <div className="min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--color-text)" }}
                >
                  {f.title}
                </p>
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                  {f.sync_status}
                  {f.last_synced_at
                    ? ` · ${new Date(f.last_synced_at).toLocaleString("de-DE")}`
                    : ""}
                </p>
              </div>
              {f.source_url && (
                <a
                  href={f.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline"
                  style={{ color: "var(--color-accent)" }}
                >
                  oeffnen
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
