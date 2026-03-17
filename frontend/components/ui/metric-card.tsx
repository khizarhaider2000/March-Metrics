import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type Trend = "up" | "down" | "neutral";

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: Trend;
  trendLabel?: string;
  icon?: React.ReactNode;
  accent?: boolean;
  className?: string;
}

const trendConfig: Record<Trend, { icon: React.ElementType; color: string }> = {
  up:      { icon: TrendingUp,   color: "text-green-400" },
  down:    { icon: TrendingDown, color: "text-red-400"   },
  neutral: { icon: Minus,        color: "text-slate-500"  },
};

export function MetricCard({
  label,
  value,
  sub,
  trend,
  trendLabel,
  icon,
  accent = false,
  className,
}: MetricCardProps) {
  const TrendIcon = trend ? trendConfig[trend].icon : null;
  const trendColor = trend ? trendConfig[trend].color : "";

  return (
    <div
      className={cn(
        "rounded-xl border bg-surface-card p-5 space-y-3",
        accent
          ? "border-brand/30 bg-brand-muted/30"
          : "border-surface-border",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
          {label}
        </span>
        {icon && (
          <span className="text-slate-600">{icon}</span>
        )}
      </div>

      <div>
        <p
          className={cn(
            "text-2xl font-bold tracking-tight leading-none",
            accent ? "text-brand-light" : "text-white"
          )}
        >
          {value}
        </p>
        {sub && (
          <p className="text-xs text-slate-500 mt-1">{sub}</p>
        )}
      </div>

      {trend && TrendIcon && (
        <div className={cn("flex items-center gap-1 text-xs font-medium", trendColor)}>
          <TrendIcon className="w-3 h-3" />
          <span>{trendLabel ?? trend}</span>
        </div>
      )}
    </div>
  );
}
