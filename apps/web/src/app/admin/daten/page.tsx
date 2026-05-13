import Link from "next/link";
import { createUserClient } from "@/lib/db/supabase-server";
import { requireOrgId } from "@/lib/db/org-context";

export const dynamic = "force-dynamic";

type FolderRow = {
  id: string;
  name: string;
  external_path: string | null;
  provider_id: string | null;
};

type FolderAccessRow = {
  folder_id: string;
  group_id: string;
};

type GroupRow = {
  id: string;
  name: string;
};

type SourceCountRow = {
  folder_id: string | null;
  count: number;
};

type FolderCard = {
  id: string | null;
  name: string;
  description: string;
  source_count: number;
  groups: string[];
  provider_id: string | null;
  external_path: string | null;
};

/**
 * Berater-Daten — Datenpool-Übersicht.
 *
 * Read-only. Zeigt pro Ordner: Name + Quelle (SharePoint/Drive/Custom),
 * Anzahl Dokumente, zugewiesene Berechtigungsgruppen. „Öffentlich" als
 * impliziter erster Eintrag für Sources ohne folder_id.
 *
 * Konfiguration (Ordner anlegen, Gruppen zuweisen) lebt unter
 * /berechtigungen — diese Page ist nur das Operating Picture für den
 * Berater. Zum Anbinden neuer Datenquellen → /admin/integrationen.
 */
export default async function BeraterDatenPage() {
  const orgId = await requireOrgId();
  const db = await createUserClient();

  const [foldersRes, accessRes, groupsRes, sourcesByFolder, publicCount] = await Promise.all([
    db.from("source_folders").select("id, name, external_path, provider_id").eq("organization_id", orgId).order("name"),
    db.from("source_folder_access").select("folder_id, group_id").eq("organization_id", orgId),
    db.from("permission_groups").select("id, name").eq("organization_id", orgId),
    db.rpc("count_sources_per_folder", { org_id_param: orgId }).then((res) => {
      // Falls die RPC-Funktion nicht existiert: Fallback per JS-Aggregation.
      if (res.error) return { data: null as SourceCountRow[] | null };
      return { data: res.data as SourceCountRow[] };
    }),
    db
      .from("sources")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("folder_id", null)
      .is("deleted_at", null),
  ]);

  const folders = (foldersRes.data ?? []) as FolderRow[];
  const accessRows = (accessRes.data ?? []) as FolderAccessRow[];
  const groups = (groupsRes.data ?? []) as GroupRow[];
  const groupById = new Map(groups.map((g) => [g.id, g.name] as const));

  // Source-Counts pro Folder. Wenn die RPC fehlt (Migration noch nicht
  // angelegt), fallback: einzelne Counts pro Folder via head-Reads. Das ist
  // bei wenigen Foldern (Pilot-Stand) ok — bei vielen würden wir die RPC
  // schreiben.
  let countsByFolder = new Map<string, number>();
  if (sourcesByFolder.data) {
    for (const r of sourcesByFolder.data) {
      if (r.folder_id) countsByFolder.set(r.folder_id, r.count);
    }
  } else {
    const counts = await Promise.all(
      folders.map(async (f) => {
        const { count } = await db
          .from("sources")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("folder_id", f.id)
          .is("deleted_at", null);
        return [f.id, count ?? 0] as const;
      }),
    );
    countsByFolder = new Map(counts);
  }

  // Folder → Gruppen-Liste
  const groupsByFolder = new Map<string, string[]>();
  for (const a of accessRows) {
    const groupName = groupById.get(a.group_id);
    if (!groupName) continue;
    const list = groupsByFolder.get(a.folder_id) ?? [];
    list.push(groupName);
    groupsByFolder.set(a.folder_id, list);
  }

  const cards: FolderCard[] = [
    {
      id: null,
      name: "Öffentlich",
      description: "Quellen ohne Ordner-Zuweisung — sichtbar für alle Mitglieder der Org.",
      source_count: publicCount.count ?? 0,
      groups: ["alle Mitglieder"],
      provider_id: null,
      external_path: null,
    },
    ...folders.map<FolderCard>((f) => ({
      id: f.id,
      name: f.name,
      description: providerLabel(f.provider_id, f.external_path),
      source_count: countsByFolder.get(f.id) ?? 0,
      groups: groupsByFolder.get(f.id) ?? [],
      provider_id: f.provider_id,
      external_path: f.external_path,
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-placeholder)" }}>
          Berater · Daten
        </span>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
          Datenpools
        </h1>
        <p className="text-[13px]" style={{ color: "var(--color-muted)" }}>
          Welche Daten liegen für diesen Kunden bereit, wer darf was sehen. Anbinden neuer Quellen → <Link href="/admin/integrationen" style={{ color: "var(--color-accent)" }}>Datenquellen + Sync</Link>. Gruppen + Folder-Zuweisung pflegen → <Link href="/berechtigungen" style={{ color: "var(--color-accent)" }}>Berechtigungen</Link>.
        </p>
      </header>

      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {cards.map((c) => (
          <li
            key={c.id ?? "public"}
            className="rounded-2xl p-5 flex flex-col gap-3"
            style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-semibold truncate" style={{ color: "var(--color-text)" }}>
                  {c.name}
                </span>
                <span className="text-[11px] truncate" style={{ color: "var(--color-muted)" }}>
                  {c.description}
                </span>
              </div>
              <ProviderIcon providerId={c.provider_id} isPublic={c.id === null} />
            </div>

            <div className="flex items-baseline gap-2">
              <span
                className="text-2xl font-bold leading-none"
                style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
              >
                {c.source_count}
              </span>
              <span className="text-[12px]" style={{ color: "var(--color-muted)" }}>
                {c.source_count === 1 ? "Dokument" : "Dokumente"}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {c.groups.length === 0 ? (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                  style={{ background: "var(--color-warning-soft, #fff7e6)", color: "var(--color-warning)" }}
                >
                  keine Gruppe zugewiesen
                </span>
              ) : (
                c.groups.map((g) => (
                  <span
                    key={g}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                    style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                  >
                    {g}
                  </span>
                ))
              )}
            </div>
          </li>
        ))}
      </ul>

      {cards.length === 1 && (
        <div
          className="rounded-2xl p-6 text-center"
          style={{ background: "var(--color-panel)", border: "1px dashed var(--color-line)", color: "var(--color-muted)" }}
        >
          Noch keine Ordner angelegt. Beim Verbinden einer Datenquelle (SharePoint/Drive) entstehen Ordner automatisch — oder leg sie manuell unter Berechtigungen an.
        </div>
      )}
    </div>
  );
}

function providerLabel(providerId: string | null, path: string | null): string {
  if (providerId === "sharepoint") return path ? `SharePoint · ${path}` : "SharePoint";
  if (providerId === "google_drive" || providerId === "gdrive") return path ? `Drive · ${path}` : "Google Drive";
  if (providerId === "custom") return "Manuell verwaltet";
  return "Eigener Ordner";
}

function ProviderIcon({ providerId, isPublic }: { providerId: string | null; isPublic: boolean }) {
  const color =
    isPublic
      ? "var(--color-accent)"
      : providerId === "sharepoint"
      ? "#0078D4"
      : providerId === "google_drive" || providerId === "gdrive"
      ? "#1A73E8"
      : "var(--color-muted)";
  return (
    <span
      className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center text-[12px] font-bold"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
      aria-hidden
    >
      {isPublic ? "ALL" : providerId === "sharepoint" ? "SP" : providerId === "google_drive" || providerId === "gdrive" ? "GD" : "F"}
    </span>
  );
}
