import { cn } from "@/lib/utils";

interface StatBarProps {
  label: string;
  value: number;       // 0–100
  displayValue?: string;
  colorClass?: string;
  className?: string;
}

export function StatBar({
  label,
  value,
  displayValue,
  colorClass = "bg-blue-500",
  className,
}: StatBarProps) {
  const pct = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-medium text-slate-300 tabular-nums">
          {displayValue ?? `${pct.toFixed(0)}`}
        </span>
      </div>
      <div className="h-1.5 w-full bg-surface-overlay rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Side-by-side comparison bar for two teams. */
interface DualStatBarProps {
  label: string;
  teamAValue: number;   // 0–100
  teamBValue: number;
  teamAName: string;
  teamBName: string;
}

export function DualStatBar({
  label,
  teamAValue,
  teamBValue,
  teamAName,
  teamBName,
}: DualStatBarProps) {
  const a = Math.max(0, Math.min(100, teamAValue));
  const b = Math.max(0, Math.min(100, teamBValue));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-blue-400 font-medium tabular-nums">{a.toFixed(0)}</span>
        <span className="text-slate-500">{label}</span>
        <span className="text-violet-400 font-medium tabular-nums">{b.toFixed(0)}</span>
      </div>
      <div className="flex gap-0.5 h-1.5">
        {/* Team A bar — grows left-to-right from center */}
        <div className="flex-1 flex justify-end">
          <div
            className="h-full bg-blue-500 rounded-l-full transition-all duration-500"
            style={{ width: `${a}%` }}
          />
        </div>
        <div className="w-px bg-surface-border" />
        <div className="flex-1">
          <div
            className="h-full bg-violet-500 rounded-r-full transition-all duration-500"
            style={{ width: `${b}%` }}
          />
        </div>
      </div>
    </div>
  );
}
