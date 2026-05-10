import { isPlatformAdmin } from "@/lib/db/queries/organization";
import { getMemberRole } from "@/lib/db/org-context";
import { WorkspaceHome } from "./_workspace/home";
import { BeraterOverview } from "./_workspace/berater-overview";
import { HaiwayMission } from "./_workspace/haiway-mission";

// Persona-Switch fürs Root-Dashboard. Drei Personas, drei Cockpits:
//
//  HAIway-intern (is_platform_admin=true)            → Mission Control
//  Berater pro Kunden-Org (role IN ('admin','owner')) → Outcome-Cockpit
//  End-User (role='member')                           → Workspace-Home
//
// Stat-Reads sind günstig (head:true counts, kpi_event-Aggregat); 30s Cache
// reicht für ein lebendiges Cockpit-Gefühl ohne DB-Stress.
export const revalidate = 30;

export default async function HomePage() {
  const [admin, role] = await Promise.all([
    isPlatformAdmin().catch(() => false),
    getMemberRole().catch(() => null),
  ]);

  if (admin) return <HaiwayMission />;
  if (role === "admin" || role === "owner") return <BeraterOverview />;
  return <WorkspaceHome />;
}
