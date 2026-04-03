import { Skeleton } from "@/components/ui/skeleton";
import { page, card } from "@/components/ui/table-classes";

export default function Loading() {
  return (
    <div className={page.wrapper}>
      <div className="flex flex-col gap-1">
        <h1
          className="text-2xl md:text-3xl font-semibold"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Telefon-Assistent
        </h1>
        <Skeleton className="h-4 w-48 mt-1" />
      </div>

      {/* Status card */}
      <div
        className={card.base}
        style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>

      {/* Call list */}
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className={card.base}
            style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
