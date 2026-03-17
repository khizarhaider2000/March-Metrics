import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4",
        className
      )}
    >
      <div className="space-y-1 min-w-0">
        {badge && <div className="mb-2">{badge}</div>}
        <h1 className="text-xl font-semibold text-white tracking-tight leading-none">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-slate-400 leading-relaxed">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
