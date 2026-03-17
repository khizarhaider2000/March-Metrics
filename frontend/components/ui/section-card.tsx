import { cn } from "@/lib/utils";

interface SectionCardProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  padded?: boolean;
  className?: string;
}

export function SectionCard({
  title,
  description,
  action,
  children,
  padded = true,
  className,
}: SectionCardProps) {
  const hasHeader = title || action;

  return (
    <div
      className={cn(
        "rounded-xl border border-surface-border bg-surface-card",
        "shadow-card",
        className
      )}
    >
      {hasHeader && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <div>
            {title && (
              <h2 className="text-sm font-semibold text-white">{title}</h2>
            )}
            {description && (
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </div>
  );
}
