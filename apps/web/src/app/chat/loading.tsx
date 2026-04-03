import { Skeleton } from "@/components/ui/skeleton";
import { page } from "@/components/ui/table-classes";

export default function Loading() {
  return (
    <div className={page.wrapper}>
      <div className="flex flex-col gap-1">
        <h1
          className="text-2xl md:text-3xl font-semibold"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Chat
        </h1>
        <Skeleton className="h-4 w-56 mt-1" />
      </div>
      <div
        className="flex-1 rounded-[var(--radius-card)] p-6"
        style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)", minHeight: 300 }}
      >
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      <Skeleton className="h-[44px] w-full rounded-[var(--radius-md)]" />
    </div>
  );
}
