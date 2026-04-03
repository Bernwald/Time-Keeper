import { Skeleton } from "./skeleton";
import { page, card } from "./table-classes";

/**
 * Standard skeleton for list pages (header + rows).
 * Used by loading.tsx files across routes.
 */
export function PageSkeleton({
  title,
  rows = 5,
  showButton = true,
}: {
  title?: string;
  rows?: number;
  showButton?: boolean;
}) {
  return (
    <div className={page.wrapper}>
      <div className={page.headerRow}>
        <div className={page.header}>
          {title ? (
            <h1
              className="text-2xl md:text-3xl font-semibold"
              style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
            >
              {title}
            </h1>
          ) : (
            <Skeleton className="h-8 w-40" />
          )}
          <Skeleton className="h-4 w-24 mt-1" />
        </div>
        {showButton && <Skeleton className="h-[44px] w-28 rounded-[var(--radius-card)]" />}
      </div>

      <div className="flex flex-col gap-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className={card.base}
            style={{
              background: "var(--color-panel)",
              border: "1px solid var(--color-line)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-2 flex-1">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
