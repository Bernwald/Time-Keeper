import { notFound } from "next/navigation";
import { getPlatformOrganization, listPlanTiers, getOrgIntegrations } from "@/lib/db/queries/admin";
import { updateOrganization } from "../actions";
import { FeatureToggle } from "../kunden/[id]/feature-toggle";
import { InviteForm } from "../kunden/[id]/invite-form";

export const dynamic = "force-dynamic";

export default async function MeinUnternehmenPage() {
  const org = await getPlatformOrganization();
  if (!org) notFound();

  const [planTiers, integrations] = await Promise.all([
    listPlanTiers(),
    getOrgIntegrations(org.id),
  ]);

  const plan = org.plan_id ?? "standard";
  const updateAction = updateOrganization.bind(null, org.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Mein Unternehmen
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          Verwaltung der internen hAIway-Organisation — Team einladen, Features schalten,
          Integrationen pflegen.
        </p>
      </div>

      {/* Org details */}
      <section
        className="rounded-xl p-5"
        style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
      >
        <h3 className="text-base font-semibold mb-4" style={{ color: "var(--color-text)" }}>
          Stammdaten
        </h3>
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
                style={{
                  border: "1px solid var(--color-line)",
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                }}
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
                style={{
                  border: "1px solid var(--color-line)",
                  background: "var(--color-bg-elevated)",
                  color: "var(--color-muted)",
                }}
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
                style={{
                  border: "1px solid var(--color-line)",
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                }}
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
                style={{
                  border: "1px solid var(--color-line)",
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                }}
              >
                {planTiers.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.name}
                  </option>
                ))}
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

      {/* Team */}
      <section
        className="rounded-xl p-5"
        style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
      >
        <h3 className="text-base font-semibold mb-4" style={{ color: "var(--color-text)" }}>
          Team ({org.members.length})
        </h3>

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
                    background:
                      m.role === "owner" ? "var(--color-accent-soft)" : "var(--color-bg-elevated)",
                    color: m.role === "owner" ? "var(--color-accent)" : "var(--color-muted)",
                  }}
                >
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        )}

        <InviteForm orgId={org.id} />
      </section>

      {/* Features */}
      <section
        className="rounded-xl p-5"
        style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
      >
        <h3 className="text-base font-semibold mb-4" style={{ color: "var(--color-text)" }}>
          Features
        </h3>

        <ul className="flex flex-col gap-2">
          {org.features.map((f) => (
            <FeatureToggle key={f.feature_key} orgId={org.id} feature={f} />
          ))}
        </ul>
      </section>

      {/* Integrations */}
      <section
        className="rounded-xl p-5"
        style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
      >
        <h3 className="text-base font-semibold mb-4" style={{ color: "var(--color-text)" }}>
          Integrationen
        </h3>

        {integrations.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Keine Integrationen konfiguriert.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {integrations.map((integration) => (
              <li
                key={integration.id}
                className="flex items-center justify-between min-h-[44px] px-3 rounded-lg"
                style={{ background: "var(--color-bg)" }}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                    {integration.provider_name}
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {integration.category} ·{" "}
                    {integration.credential_mode === "customer" ? "Eigener Key" : "Platform-Key"}
                  </span>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background:
                      integration.status === "active"
                        ? "var(--color-success-soft, var(--color-accent-soft))"
                        : "var(--color-bg-elevated)",
                    color:
                      integration.status === "active"
                        ? "var(--color-success, var(--color-accent))"
                        : "var(--color-muted)",
                  }}
                >
                  {integration.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
