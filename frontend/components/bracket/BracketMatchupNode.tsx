"use client";

import { AlertTriangle, ChevronRight, Minus, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BracketGameOut } from "@/lib/api";

export interface BracketMatchupNodeProps {
  game: BracketGameOut;
  onClick: () => void;
  isChampionship?: boolean;
}

function isUpset(game: BracketGameOut): boolean {
  if (!game.winner || !game.loser) return false;
  return (game.winner.seed ?? 99) > (game.loser.seed ?? 99);
}

export function BracketMatchupNode({
  game,
  onClick,
  isChampionship = false,
}: BracketMatchupNodeProps) {
  const teamA  = game.team_a;
  const teamB  = game.team_b;
  const upset  = isUpset(game);

  const teams = [
    { t: teamA, isWinner: game.winner?.team_id === teamA?.team_id },
    { t: teamB, isWinner: game.winner?.team_id === teamB?.team_id },
  ];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={cn(
        "cursor-pointer select-none rounded-lg border transition-all duration-150",
        "focus:outline-none focus:ring-1 focus:ring-brand/40",
        isChampionship
          ? "border-amber-800/60 bg-amber-950/15 hover:border-amber-600/60"
          : upset
          ? "border-orange-900/50 bg-surface-card hover:border-orange-700/50 hover:bg-surface-overlay"
          : "border-surface-border bg-surface-card hover:border-brand/40 hover:bg-surface-overlay",
      )}
    >
      {/* Team rows */}
      <div className="px-1.5 pt-1.5 pb-0.5 space-y-px">
        {teams.map(({ t, isWinner }, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-1.5 px-1 py-0.5 rounded text-xs",
              isWinner
                ? isChampionship
                  ? "bg-amber-900/30"
                  : "bg-brand/10"
                : "",
            )}
          >
            {/* Seed */}
            <span className={cn(
              "w-4 text-right font-mono text-2xs shrink-0 tabular-nums",
              isWinner
                ? isChampionship ? "text-amber-400 font-semibold" : "text-brand-light font-semibold"
                : "text-slate-700",
            )}>
              {t?.seed ?? "?"}
            </span>

            {/* Name */}
            <span className={cn(
              "truncate flex-1 min-w-0 text-xs leading-tight",
              isWinner   ? "text-white font-medium" : "text-slate-500",
              !t         && "italic text-slate-700",
            )}>
              {t?.team_name ?? "TBD"}
            </span>

            {/* Indicator */}
            <span className="shrink-0 w-3">
              {isWinner
                ? isChampionship
                  ? <Trophy className="w-2.5 h-2.5 text-amber-400" />
                  : <ChevronRight className="w-2.5 h-2.5 text-brand-light" />
                : <Minus className="w-2.5 h-2.5 text-slate-800" />}
            </span>
          </div>
        ))}
      </div>

      {/* Footer: score gap + upset */}
      <div className="flex items-center px-2.5 pb-1 pt-0.5 gap-1 min-h-[14px]">
        {upset && (
          <AlertTriangle className="w-2.5 h-2.5 text-orange-500 shrink-0" />
        )}
        {game.score_gap != null && (
          <span className="text-2xs font-mono text-slate-700 ml-auto tabular-nums">
            +{game.score_gap.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
}
