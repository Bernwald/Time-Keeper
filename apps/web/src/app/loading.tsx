import { Skeleton } from "@/components/ui/skeleton";
import { page, card } from "@/components/ui/table-classes";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col">
      {/* Hero gradient banner skeleton */}
      <div className="gradient-accent px-4 md:px-8 py-8 md:py-12">
        <div className="max-w-3xl">
          <Skeleton className="h-9 w-64" style={{ background: "rgba(255,255,255,0.15)" }} />
          <Skeleton className="h-4 w-80 mt-3" style={{ background: "rgba(255,255,255,0.1)" }} />
          <div className="flex gap-2.5 mt-5">
            <Skeleton className="h-[44px] w-40 rounded-[var(--radius-card)]" style={{ background: "rgba(255,255,255,0.15)" }} />
            <Skeleton className="h-[44px] w-32 rounded-[var(--radius-card)]" style={{ background: "rgba(255,255,255,0.1)" }} />
          </div>
        </div>
      </div>

      <div className={page.wrapper}>
        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 -mt-6 md:-mt-8">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="rounded-xl p-4 md:p-5"
              style={{
                background: "var(--color-panel)",
                border: "1px solid var(--color-line)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <Skeleton className="h-10 w-12" />
              <Skeleton className="h-4 w-20 mt-2" />
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="flex gap-2.5">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[44px] w-28 rounded-[var(--radius-card)]" />
          ))}
        </div>

        {/* Recent sources */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className={card.base}
              style={{
                background: "var(--color-panel)",
                border: "1px solid var(--color-line)",
              }}
            >
              <div className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-3 w-16 shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
