"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart2,
  Swords,
  Trophy,
  Settings2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const primaryNav = [
  { label: "Home",             href: "/",                  icon: LayoutDashboard },
  { label: "Team Rankings",    href: "/team-rankings",     icon: BarChart2       },
  { label: "Matchup Analyzer", href: "/matchup-analyzer",  icon: Swords          },
  { label: "Bracket Builder",  href: "/bracket-builder",   icon: Trophy          },
];

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-surface-border bg-surface h-full">

      {/* Primary navigation */}
      <nav className="flex-1 p-2 pt-3 space-y-0.5 overflow-y-auto">
        <p className="px-3 pb-2 pt-1 text-2xs font-semibold text-slate-600 uppercase tracking-widest">
          Navigate
        </p>

        {primaryNav.map(({ label, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group",
                active
                  ? "bg-brand/10 text-white border border-brand/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-surface-overlay"
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  active ? "text-brand-light" : "text-slate-500 group-hover:text-slate-300"
                )}
              />
              <span className="flex-1 font-medium">{label}</span>
              {active && (
                <ChevronRight className="w-3 h-3 text-brand-light opacity-60" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-surface-border space-y-0.5">
        <p className="px-3 pb-1.5 pt-2 text-2xs font-semibold text-slate-600 uppercase tracking-widest">
          Tools
        </p>
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-surface-overlay transition-colors group">
          <Settings2 className="w-4 h-4 shrink-0 text-slate-500 group-hover:text-slate-300 transition-colors" />
          <span className="font-medium">Weight Profiles</span>
        </button>
      </div>

    </aside>
  );
}
