import { notFound } from "next/navigation";

import { DetailCard } from "@/components/detail-card";
import { PageHeader } from "@/components/page-header";
import { getDocumentById } from "@/lib/db/repository";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await getDocumentById(id);

  if (!document) {
    notFound();
  }

  return (
    <div className="stack">
      <PageHeader title={document.title} description={document.document_type} actionHref="/documents" actionLabel="Zurück zur Liste" secondaryActions={[{ href: `/documents/${id}/edit`, label: "Bearbeiten" }]} />
      <DetailCard title="Overview">
        <dl className="key-value">
          <dt>Status</dt>
          <dd><span className="badge status">{document.status}</span></dd>
          <dt>Dokumenttyp</dt>
          <dd>{document.document_type}</dd>
          <dt>Herkunft</dt>
          <dd>{document.origin_type}</dd>
          <dt>Sichtbarkeit</dt>
          <dd>{document.visibility_scope}</dd>
          <dt>Inhalt</dt>
          <dd>{document.content_text || document.content_markdown || "Noch kein Inhalt."}</dd>
        </dl>
      </DetailCard>
    </div>
  );
}
