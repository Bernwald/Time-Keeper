import { notFound } from "next/navigation";

import { DetailCard } from "@/components/detail-card";
import { LinkedRecords } from "@/components/linked-records";
import { PageHeader } from "@/components/page-header";
import { getSourceById, listContentItems } from "@/lib/db/repository";

export default async function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = await getSourceById(id);

  if (!source) {
    notFound();
  }

  const contentItems = await listContentItems();

  return (
    <div className="stack">
      <PageHeader
        title={source.title || source.source_name}
        description={source.source_type}
        actionHref="/sources"
        actionLabel="Zurück zur Liste"
        secondaryActions={[{ href: `/sources/${id}/edit`, label: "Bearbeiten" }]}
      />
      <div className="detail-grid">
        <DetailCard title="Overview">
          <dl className="key-value">
            <dt>Quellentyp</dt>
            <dd>{source.source_type}</dd>
            <dt>Herkunft</dt>
            <dd>{source.source_origin}</dd>
            <dt>Status</dt>
            <dd><span className="badge status">{source.status}</span></dd>
            <dt>MIME-Typ</dt>
            <dd>{source.mime_type || "—"}</dd>
            <dt>Speicherpfad</dt>
            <dd>{source.storage_path || "—"}</dd>
            <dt>Externe URL</dt>
            <dd>{source.external_url || "—"}</dd>
          </dl>
        </DetailCard>

        <LinkedRecords
          title="Abgeleitete Inhalte"
          items={contentItems
            .filter((item) => item.source_id === source.id)
            .map((item) => ({
              id: item.id,
              label: item.title,
              description: item.content_type,
              href: `/content/${item.id}`
            }))}
        />
      </div>
    </div>
  );
}
