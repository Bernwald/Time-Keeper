import { notFound } from "next/navigation";
import { getOrganizationAdmin } from "@/lib/db/queries/admin";
import { updateOrganization, toggleFeature, resetFeature, inviteMember } from "../../actions";
import { FeatureToggle } from "./feature-toggle";
import { InviteForm } from "./invite-form";

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function KundeDetailPage({ params }: Props) {
  const { id } = await params;
  const org = await getOrganizationAdmin(id);
  if (!org) notFound();

  const plan = (org.metadata as any)?.plan ?? "standard";

  const updateAction = updateOrganization.bind(null, id);

  return (
    <div className="flex flex-col gap-6">
      {/* Org details */}
      <section
        className="rounded-xl p-5"
        style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
      >
        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--color-text)" }}>
          Organisation
        </h2>
        <form action={updateAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
                Name
              </label>
              <input
                name="name"
                defaultValue={org.name}
                required
                className="min-h-[44px] px-3 rounded-lg text-sm"
                style={{ border: "1px solid var(--color-line)", background: "var(--color-bg)", color: "var(--color-text)" }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
                Slug
              </label>
              <input
                value={org.slug}
                disabled
                className="min-h-[44px] px-3 rounded-lg text-sm font-mono opacity-60"
                style={{ border: "1px solid var(--color-line)", background: "var(--color-bg-elevated)", color: "var(--color-muted)" }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
                Status
              </label>
              <select
                name="status"
                defaultValue={org.status}
                className="min-h-[44px] px-3 rounded-lg text-sm"
                style={{ border: "1px solid var(--color-line)", background: "var(--color-bg)", color: "var(--color-text)" }}
              >
                <option value="active">Aktiv</option>
                <option value="inactive">Inaktiv</option>
                <option value="suspended">Gesperrt</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
                Plan
              </label>
              <select
                name="plan"
                defaultValue={plan}
                className="min-h-[44px] px-3 rounded-lg text-sm"
                style={{ border: "1px solid var(--color-line)", background: "var(--color-bg)", color: "var(--color-text)" }}
              >
                <option value="standard">Standard</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>
          <div>
            <button
              type="submit"
              className="min-h-[44px] px-6 rounded-lg text-sm font-medium gradient-accent"
              style={{ color: "var(--color-accent-text)" }}
            >
              Speichern
            </button>
          </div>
        </form>
      </section>

      {/* Members */}
      <section
        className="rounded-xl p-5"
        style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
      >
        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--color-text)" }}>
          Mitglieder ({org.members.length})
        </h2>

        {org.members.length > 0 && (
          <ul className="flex flex-col gap-2 mb-4">
            {org.members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between min-h-[44px] px-3 rounded-lg"
                style={{ background: "var(--color-bg)" }}
              >
                <div>
                  <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                    {m.profile.full_name ?? "—"}
                  </span>
                  <span className="text-xs ml-2" style={{ color: "var(--color-muted)" }}>
                    {m.profile.email}
                  </span>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: m.role === "owner" ? "var(--color-accent-soft)" : "var(--color-bg-elevated)",
                    color: m.role === "owner" ? "var(--color-accent)" : "var(--color-muted)",
                  }}
                >
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        )}

        <InviteForm orgId={id} />
      </section>

      {/* Features */}
      <section
        className="rounded-xl p-5"
        style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
      >
        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--color-text)" }}>
          Features
        </h2>

        <ul className="flex flex-col gap-2">
          {org.features.map((f) => (
            <FeatureToggle key={f.feature_key} orgId={id} feature={f} />
          ))}
        </ul>
      </section>
    </div>
  );
}
