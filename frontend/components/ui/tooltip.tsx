import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  children:  ReactNode;
  content:   ReactNode;
  className?: string;
  /** Default: below trigger. Pass "above" for headers near bottom of viewport. */
  side?: "above" | "below";
}

export function Tooltip({ children, content, className, side = "below" }: TooltipProps) {
  const isBelow = side === "below";

  return (
    <span className={cn("relative group/tip inline-flex items-center", className)}>
      {children}

      {/* Tooltip panel — only rendered when there is content */}
      {content != null && <span
        className={cn(
          // positioning
          "absolute left-1/2 -translate-x-1/2 z-50",
          isBelow ? "top-full mt-2" : "bottom-full mb-2",
          // visibility
          "pointer-events-none opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150",
          // appearance
          "w-52 rounded-lg border border-slate-700/80 bg-slate-900",
          "px-3 py-2 text-xs text-slate-300 leading-relaxed",
          "shadow-xl shadow-black/40",
          "whitespace-normal text-left font-normal normal-case tracking-normal",
        )}
      >
        {/* Arrow */}
        <span
          className={cn(
            "absolute left-1/2 -translate-x-1/2 block w-2.5 h-2.5",
            "bg-slate-900 border-slate-700/80 rotate-45",
            isBelow
              ? "-top-[5px] border-t border-l"
              : "-bottom-[5px] border-b border-r",
          )}
        />
        {content}
      </span>}
    </span>
  );
}
