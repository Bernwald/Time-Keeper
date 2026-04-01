import { EntityTable } from "@/components/entity-table";
import { LiveFiltersBar } from "@/components/live-filters-bar";
import { PageHeader } from "@/components/page-header";
import { statusOptions } from "@/lib/config/modules";
import { listContacts } from "@/lib/db/repository";
import { matchesSearch, matchesStatus } from "@/lib/search/filters";

type Props = {
  searchParams?: Promise<{ q?: string; status?: string }>;
};

export default async function ContactsPage({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const query = params.q || "";
  const status = params.status || "all";
  const contacts = await listContacts();
  const filtered = contacts.filter(
    (contact) =>
      matchesSearch(
        `${contact.first_name} ${contact.last_name} ${contact.company_name || ""} ${contact.role_title || ""}`,
        query
      ) && matchesStatus(contact.status, status)
  );

  return (
    <div className="stack">
      <PageHeader
        title="Kontakte"
        description="Personen und deren Rollen in Organisationen und Projekten."
        actionHref="/contacts/new"
        actionLabel="Neuer Kontakt"
      />
      <LiveFiltersBar statuses={[...statusOptions.contacts]} />
      <EntityTable
        items={filtered}
        getRowHref={(item) => `/contacts/${item.id}`}
        columns={[
          { key: "name", label: "Name", render: (item) => <strong>{`${item.first_name} ${item.last_name}`}</strong> },
          { key: "company", label: "Unternehmen", render: (item) => item.company_name || "—" },
          { key: "role_title", label: "Rolle", render: (item) => item.role_title || "—" },
          { key: "email", label: "E-Mail", render: (item) => item.email || "—" }
        ]}
      />
    </div>
  );
}
