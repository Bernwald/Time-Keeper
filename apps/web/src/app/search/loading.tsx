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
          Suche
        </h1>
        <Skeleton className="h-4 w-48 mt-1" />
      </div>
      <Skeleton className="h-[44px] w-full rounded-[var(--radius-md)]" />
    </div>
  );
}
