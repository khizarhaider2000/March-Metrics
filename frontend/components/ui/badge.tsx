import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "purple"
  | "slate";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-slate-800 text-slate-300 border-slate-700",
  blue:    "bg-blue-950 text-blue-400 border-blue-900",
  green:   "bg-green-950 text-green-400 border-green-900",
  amber:   "bg-amber-950 text-amber-400 border-amber-900",
  red:     "bg-red-950 text-red-400 border-red-900",
  purple:  "bg-purple-950 text-purple-400 border-purple-900",
  slate:   "bg-slate-900 text-slate-400 border-slate-800",
};

const dotStyles: Record<BadgeVariant, string> = {
  default: "bg-slate-400",
  blue:    "bg-blue-400",
  green:   "bg-green-400",
  amber:   "bg-amber-400",
  red:     "bg-red-400",
  purple:  "bg-purple-400",
  slate:   "bg-slate-500",
};

export function Badge({
  children,
  variant = "default",
  dot = false,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full",
        "text-xs font-medium border",
        variantStyles[variant],
        className
      )}
    >
      {dot && (
        <span
          className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotStyles[variant])}
        />
      )}
      {children}
    </span>
  );
}
