import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "full";
}

export function Skeleton({ className, rounded = "md" }: SkeletonProps) {
  const roundedMap = {
    sm:   "rounded",
    md:   "rounded-lg",
    lg:   "rounded-xl",
    full: "rounded-full",
  };
  return (
    <div
      className={cn("skeleton", roundedMap[rounded], className)}
      aria-hidden="true"
    />
  );
}

/** A full card skeleton matching SectionCard proportions. */
export function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={`h-3 ${i % 3 === 2 ? "w-4/5" : "w-full"}`} />
        ))}
      </div>
    </div>
  );
}

/** A table-row skeleton. */
export function RowSkeleton({ cols = 5 }: { cols?: number }) {
  const widths = ["w-8", "w-40", "w-20", "w-16", "w-16", "w-12"];
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-surface-border last:border-0">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3.5 ${widths[i % widths.length]}`}
        />
      ))}
    </div>
  );
}
