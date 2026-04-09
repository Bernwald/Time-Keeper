import { redirect } from "next/navigation";
import { createServiceClient, getUser } from "@/lib/db/supabase-server";
import { requireOrgId } from "@/lib/db/org-context";
import { card, page, styles } from "@/components/ui/table-classes";
import { RestoreButton, PurgeButton } from "@/app/quellen/retry-button";

export const dynamic = "force-dynamic";

type DeletedSource = {
  id: string;
  title: string;
  source_type: string;
  connector_type: string | null;
  source_url: string | null;
  deleted_at: string;
  word_count: number | null;
};

const ORIGIN_LABEL: Record<string, string> = {
  gdrive: "Google Drive",
  sharepoint: "SharePoint",
};

export default async function PapierkorbPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const orgId = await requireOrgId();

  // RLS hides deleted_at IS NOT NULL rows from authenticated reads, so we
  // call the SECURITY DEFINER RPC via the service client.
  const db = createServiceClient();
  const { data, error } = await db.rpc("list_deleted_sources", { p_org_id: orgId });
  if (error) throw error;
  const items = (data ?? []) as DeletedSource[];

  return (
    <div className={page.wrapper}>
      <div className={page.header}>
        <h1
          className="text-xl md:text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Papierkorb
        </h1>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Gelöschte oder verwaiste Dateien. Wiederherstellen reaktiviert sie im
          nächsten Sync. Endgültig löschen entfernt sie unwiederbringlich.
        </p>
      </div>

      {items.length === 0 ? (
        <div className={card.flat} style={styles.panel}>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Der Papierkorb ist leer.
          </p>
        </div>
      ) : (
        <div className={card.flat} style={styles.panel}>
          <ul className="flex flex-col divide-y" style={{ borderColor: "var(--color-border)" }}>
            {items.map((s) => {
              const origin = s.connector_type
                ? ORIGIN_LABEL[s.connector_type] ?? s.connector_type
                : s.source_type;
              return (
                <li key={s.id} className="flex items-center gap-3 py-3 min-h-[44px]">
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: "var(--color-text)" }}
                    >
                      {s.title}
                    </p>
                    <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                      {origin} · gelöscht{" "}
                      {new Date(s.deleted_at).toLocaleString("de-DE")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <RestoreButton sourceId={s.id} />
                    <PurgeButton sourceId={s.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
