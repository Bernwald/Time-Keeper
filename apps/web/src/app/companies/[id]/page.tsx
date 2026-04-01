import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanyById } from "@/lib/db/queries/companies";
import { updateCompany, deleteCompany } from "@/app/actions";
import { card, btn, input } from "@/components/ui/table-classes";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompanyById(id);
  if (!company) notFound();

  const updateAction = updateCompany.bind(null, id);
  const deleteAction = deleteCompany.bind(null, id);

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8 max-w-xl">
      <Link href="/companies" className="text-sm" style={{ color: "var(--color-muted)" }}>
        ← Alle Unternehmen
      </Link>

      <h1
        className="text-2xl font-semibold"
        style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
      >
        {company.name}
      </h1>

      <form
        action={updateAction}
        className={`${card.base} flex flex-col gap-5`}
        style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Name *</label>
          <input
            name="name"
            required
            defaultValue={company.name}
            className={input.base}
            style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)", color: "var(--color-text)" }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Website</label>
          <input
            name="website"
            type="url"
            defaultValue={company.website ?? ""}
            placeholder="https://…"
            className={input.base}
            style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)", color: "var(--color-text)" }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Status</label>
          <select
            name="status"
            defaultValue={company.status}
            className={input.base}
            style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)", color: "var(--color-text)" }}
          >
            <option value="active">Aktiv</option>
            <option value="inactive">Inaktiv</option>
            <option value="archived">Archiviert</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Notizen</label>
          <textarea
            name="notes"
            rows={4}
            defaultValue={company.notes ?? ""}
            className={input.textarea}
            style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)", color: "var(--color-text)" }}
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            className={btn.primary}
            style={{ background: "var(--color-accent)", color: "#fff" }}
          >
            Speichern
          </button>
        </div>
      </form>

      <form action={deleteAction}>
        <button
          type="submit"
          className={btn.danger}
          style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
        >
          Unternehmen löschen
        </button>
      </form>
    </div>
  );
}
