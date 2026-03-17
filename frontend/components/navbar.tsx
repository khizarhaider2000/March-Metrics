"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, Swords, Trophy, Activity, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Rankings",  href: "/team-rankings",     icon: BarChart2 },
  { label: "Matchup",   href: "/matchup-analyzer",  icon: Swords    },
  { label: "Bracket",   href: "/bracket-builder",   icon: Trophy    },
  { label: "Upsets",    href: "/upset-finder",      icon: Zap       },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="h-14 shrink-0 sticky top-0 z-50 border-b border-surface-border bg-surface/95 backdrop-blur-sm">
      <div className="h-full flex items-center px-4 gap-2">

        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 shrink-0 mr-2 group"
        >
          <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center shadow-glow group-hover:bg-brand-dark transition-colors">
            <span className="text-white text-xs font-bold tracking-tighter">MM</span>
          </div>
          <span className="hidden sm:block font-semibold text-white text-sm tracking-tight">
            March Metrics
          </span>
        </Link>

        {/* Divider */}
        <div className="hidden sm:block h-5 w-px bg-surface-border mx-1" />

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-0.5">
          {navLinks.map(({ label, href, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "text-white bg-surface-overlay"
                    : "text-slate-400 hover:text-slate-200 hover:bg-surface-overlay/60"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-950/80 border border-green-900/60 text-green-400 text-xs font-medium">
            <Activity className="w-3 h-3" />
            <span>API Live</span>
          </div>

          {/* Season badge */}
          <div className="px-2 py-1 rounded-md bg-surface-overlay border border-surface-border text-slate-400 text-xs font-mono">
            2026
          </div>
        </div>

      </div>
    </header>
  );
}
