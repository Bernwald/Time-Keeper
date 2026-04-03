export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`animate-pulse rounded-[var(--radius-md)] ${className}`}
      style={{ background: "var(--color-bg-elevated)", ...style }}
    />
  );
}
