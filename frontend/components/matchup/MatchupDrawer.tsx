"use client";

import { useEffect, useState } from "react";
import {
  X, Trophy, Loader2, ChevronRight, Info,
  Flame, Shield, Lock, ArrowUpDown, BarChart2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  api,
  BracketGameOut,
  MatchupResponse,
  TeamDetailOut,
  CategoryEdgeOut,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";

// ─── Constants ────────────────────────────────────────────────────────────────

const CONFIDENCE_VARIANT: Record<string, "slate" | "blue" | "amber" | "green"> = {
  "toss-up":        "slate",
  "slight edge":    "blue",
  "moderate edge":  "amber",
  "clear favorite": "green",
  "heavy favorite": "green",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  "toss-up":        "Toss-Up",
  "slight edge":    "Slight Edge",
  "moderate edge":  "Moderate Edge",
  "clear favorite": "Clear Favorite",
  "heavy favorite": "Heavy Favorite",
};

const REGION_VARIANT: Record<string, "blue" | "green" | "amber" | "purple"> = {
  East: "blue", West: "green", South: "amber", Midwest: "purple",
};

function categoryIcon(category: string) {
  const s = category.toLowerCase();
  if (s.includes("offens") || s.includes("output"))              return Flame;
  if (s.includes("defens") || s.includes("strength"))            return Shield;
  if (s.includes("ball") || s.includes("security") || s.includes("turnover")) return Lock;
  if (s.includes("rebound"))                                     return ArrowUpDown;
  return BarChart2;
}

// ─── Full metrics definition ──────────────────────────────────────────────────

type MetricKey = keyof NonNullable<TeamDetailOut["metrics"]>;

interface MetricDef {
  key:          MetricKey;
  label:        string;
  section:      string;
  higherBetter: boolean | null; // null = neutral (tempo)
  format:       (v: number) => string;
}

const METRIC_DEFS: MetricDef[] = [
  // Overall
  { key: "adj_em",      label: "Adj EM",     section: "Overall",   higherBetter: true,  format: (v) => v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1) },
  { key: "sos",         label: "SOS",        section: "Overall",   higherBetter: true,  format: (v) => v.toFixed(2) },
  // Offense
  { key: "adj_o",       label: "Adj O",      section: "Offense",   higherBetter: true,  format: (v) => v.toFixed(1) },
  { key: "efg_pct",     label: "eFG%",       section: "Shooting",  higherBetter: true,  format: (v) => `${(v * 100).toFixed(1)}%` },
  { key: "ft_rate",     label: "FT Rate",    section: "Shooting",  higherBetter: true,  format: (v) => v.toFixed(2) },
  // Defense
  { key: "adj_d",       label: "Adj D",      section: "Defense",   higherBetter: false, format: (v) => v.toFixed(1) },
  { key: "opp_efg_pct", label: "Opp eFG%",   section: "Defense",   higherBetter: false, format: (v) => `${(v * 100).toFixed(1)}%` },
  // Possession
  { key: "to_pct",      label: "TO%",        section: "Possession",higherBetter: false, format: (v) => `${(v * 100).toFixed(1)}%` },
  { key: "opp_to_pct",  label: "Opp TO%",    section: "Possession",higherBetter: true,  format: (v) => `${(v * 100).toFixed(1)}%` },
  { key: "orb_pct",     label: "ORB%",       section: "Possession",higherBetter: true,  format: (v) => `${(v * 100).toFixed(1)}%` },
  { key: "drb_pct",     label: "DRB%",       section: "Possession",higherBetter: true,  format: (v) => `${(v * 100).toFixed(1)}%` },
  // Style
  { key: "tempo",       label: "Tempo",      section: "Style",     higherBetter: null,  format: (v) => v.toFixed(1) },
];

// ─── Category row ─────────────────────────────────────────────────────────────

function CategoryRow({
  cat,
  nameA,
  nameB,
}: {
  cat:   CategoryEdgeOut;
  nameA: string;
  nameB: string;
}) {
  const aScore = Math.max(0, Math.min(100, cat.team_a_score));
  const bScore = Math.max(0, Math.min(100, cat.team_b_score));
  const aWins  = aScore > bScore;
  const bWins  = bScore > aScore;
  const Icon   = categoryIcon(cat.category);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3 h-3 text-slate-500 shrink-0" />
          <span className="text-xs text-slate-400">{cat.label}</span>
        </div>
        <span className="text-2xs text-slate-600">{cat.edge_strength}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className={cn("text-xs font-mono w-7 text-right shrink-0 tabular-nums", aWins ? "text-blue-400 font-bold" : "text-slate-600")}>
          {aScore.toFixed(0)}
        </span>
        <div className="flex flex-1 gap-0.5 h-1.5 rounded-full overflow-hidden bg-surface-overlay">
          <div className="flex-1 flex justify-end overflow-hidden">
            <div className={cn("h-full transition-[width] duration-500", aWins ? "bg-blue-500" : "bg-blue-900/40")} style={{ width: `${aScore}%` }} />
          </div>
          <div className="w-px bg-slate-800 shrink-0" />
          <div className="flex-1 overflow-hidden">
            <div className={cn("h-full transition-[width] duration-500", bWins ? "bg-violet-500" : "bg-violet-900/40")} style={{ width: `${bScore}%` }} />
          </div>
        </div>
        <span className={cn("text-xs font-mono w-7 shrink-0 tabular-nums", bWins ? "text-violet-400 font-bold" : "text-slate-600")}>
          {bScore.toFixed(0)}
        </span>
      </div>

      <div className="flex justify-between text-2xs px-8">
        {aWins
          ? <span className="text-blue-500 flex items-center gap-0.5"><CheckCircle2 className="w-2.5 h-2.5" />{nameA.split(" ").at(-1)} edge</span>
          : <span className="text-slate-700">—</span>
        }
        {bWins
          ? <span className="text-violet-500 flex items-center gap-0.5">{nameB.split(" ").at(-1)} edge<CheckCircle2 className="w-2.5 h-2.5" /></span>
          : <span className="text-slate-700">—</span>
        }
      </div>
    </div>
  );
}

// ─── Raw metrics comparison table ────────────────────────────────────────────

function MetricsTable({
  teamADetail,
  teamBDetail,
  nameA,
  nameB,
}: {
  teamADetail: TeamDetailOut;
  teamBDetail: TeamDetailOut;
  nameA:       string;
  nameB:       string;
}) {
  const seen = new Set<string>();
  const sections = METRIC_DEFS.map((m) => m.section).filter((s) => { if (seen.has(s)) return false; seen.add(s); return true; });

  function isBetter(def: MetricDef, vA: number | null, vB: number | null): "a" | "b" | null {
    if (vA == null || vB == null) return null;
    if (def.higherBetter === true)  return vA > vB ? "a" : vA < vB ? "b" : null;
    if (def.higherBetter === false) return vA < vB ? "a" : vA > vB ? "b" : null;
    return null;
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => {
        const defs = METRIC_DEFS.filter((m) => m.section === section);
        return (
          <div key={section}>
            <p className="text-2xs font-semibold text-slate-600 uppercase tracking-widest mb-1.5">
              {section}
            </p>
            <div className="rounded-lg border border-surface-border overflow-hidden">
              {defs.map((def, i) => {
                const vA = teamADetail.metrics[def.key];
                const vB = teamBDetail.metrics[def.key];
                const better = isBetter(def, vA, vB);

                return (
                  <div
                    key={def.key}
                    className={cn(
                      "grid grid-cols-[1fr_80px_1fr] items-center px-3 py-1.5 text-xs",
                      i % 2 === 0 ? "bg-surface-card" : "bg-surface-overlay/30",
                    )}
                  >
                    <span className={cn("font-mono text-right tabular-nums", better === "a" ? "text-blue-400 font-semibold" : "text-slate-400")}>
                      {vA != null ? def.format(vA) : "—"}
                      {better === "a" && <span className="ml-1 text-2xs">★</span>}
                    </span>
                    <span className="text-2xs text-slate-600 text-center">{def.label}</span>
                    <span className={cn("font-mono tabular-nums", better === "b" ? "text-violet-400 font-semibold" : "text-slate-400")}>
                      {vB != null ? def.format(vB) : "—"}
                      {better === "b" && <span className="ml-1 text-2xs">★</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Drawer skeleton ─────────────────────────────────────────────────────────

function DrawerSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-20 rounded-xl bg-surface-overlay" />
      <div className="h-32 rounded-xl bg-surface-overlay" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-surface-overlay" />
        ))}
      </div>
    </div>
  );
}

// ─── Main drawer ─────────────────────────────────────────────────────────────

export interface MatchupDrawerProps {
  game:    BracketGameOut | null;
  profile: string;
  onClose: () => void;
}

export function MatchupDrawer({ game, profile, onClose }: MatchupDrawerProps) {
  const [matchup,     setMatchup]     = useState<MatchupResponse | null>(null);
  const [teamADetail, setTeamADetail] = useState<TeamDetailOut | null>(null);
  const [teamBDetail, setTeamBDetail] = useState<TeamDetailOut | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!game?.team_a || !game?.team_b) return;
    setLoading(true);
    setError(null);
    setMatchup(null);
    setTeamADetail(null);
    setTeamBDetail(null);

    const aId = game.team_a.team_id;
    const bId = game.team_b.team_id;

    Promise.all([
      api.matchup(aId, bId, profile),
      api.teamById(aId),
      api.teamById(bId),
    ])
      .then(([m, a, b]) => { setMatchup(m); setTeamADetail(a); setTeamBDetail(b); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [game, profile]);

  const isOpen = game != null;

  // Resolve which matchup team corresponds to bracket team_a vs team_b
  const teamA = game?.team_a ?? null;
  const teamB = game?.team_b ?? null;
  const scoredA = matchup && teamA
    ? (matchup.winner.team_id === teamA.team_id ? matchup.winner : matchup.loser)
    : null;
  const scoredB = matchup && teamB
    ? (matchup.winner.team_id === teamB.team_id ? matchup.winner : matchup.loser)
    : null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-200"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-full sm:w-[480px] z-50",
          "bg-surface border-l border-surface-border",
          "flex flex-col shadow-2xl",
          "transition-transform duration-300 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        {game && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-surface-border shrink-0">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {game.round_name}
                  </span>
                  {game.region && (
                    <Badge variant={REGION_VARIANT[game.region] ?? "slate"} className="text-2xs">
                      {game.region}
                    </Badge>
                  )}
                  {matchup && (
                    <Badge
                      variant={CONFIDENCE_VARIANT[matchup.confidence] ?? "slate"}
                      className="text-2xs"
                    >
                      {CONFIDENCE_LABEL[matchup.confidence] ?? matchup.confidence}
                    </Badge>
                  )}
                </div>
                <p className="text-sm font-semibold text-white truncate">
                  {teamA?.team_name ?? "TBD"} vs. {teamB?.team_name ?? "TBD"}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-surface-overlay text-slate-500 hover:text-white transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Error */}
              {error && (
                <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-xs text-red-400">
                  {error}
                </div>
              )}

              {/* Loading */}
              {loading && <DrawerSkeleton />}

              {/* Results */}
              {!loading && matchup && scoredA && scoredB && (
                <>

                  {/* Winner callout */}
                  <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 px-4 py-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-900/40 border border-amber-800/40 flex items-center justify-center shrink-0">
                        <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-2xs text-amber-500/80 uppercase tracking-widest font-semibold">Projected Winner</p>
                        <p className="text-sm font-bold text-white truncate">{matchup.winner.team_name}</p>
                      </div>
                      <div className="ml-auto text-right shrink-0 space-y-0.5">
                        <p className="text-2xs text-slate-500">Score gap</p>
                        <p className="text-sm font-bold font-mono text-slate-200">+{matchup.score_gap.toFixed(1)}</p>
                      </div>
                    </div>

                    {/* March score bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-2xs text-slate-500">
                        <span>{scoredA.team_name.split(" ").at(-1)} {scoredA.march_score.toFixed(1)}</span>
                        <span>{scoredB.march_score.toFixed(1)} {scoredB.team_name.split(" ").at(-1)}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden flex bg-surface-overlay">
                        {(() => {
                          const total = scoredA.march_score + scoredB.march_score;
                          const aFrac = total > 0 ? (scoredA.march_score / total) * 100 : 50;
                          return (
                            <>
                              <div className="h-full bg-blue-600 transition-[width] duration-700" style={{ width: `${aFrac}%` }} />
                              <div className="h-full bg-violet-600 transition-[width] duration-700" style={{ width: `${100 - aFrac}%` }} />
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Category breakdown */}
                  {matchup.category_edges.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-white">Category Breakdown</p>
                        <div className="flex items-center gap-3 text-2xs text-slate-500">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />{scoredA.team_name.split(" ").at(-1)}</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />{scoredB.team_name.split(" ").at(-1)}</span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {matchup.category_edges.map((cat) => (
                          <CategoryRow key={cat.category} cat={cat} nameA={scoredA.team_name} nameB={scoredB.team_name} />
                        ))}
                      </div>
                      {/* Category edge summary */}
                      {(() => {
                        const aEdges = matchup.category_edges.filter((c) => c.team_a_score > c.team_b_score).length;
                        const total  = matchup.category_edges.length;
                        return (
                          <p className="text-2xs text-slate-500 pt-1 border-t border-surface-border">
                            <span className="text-blue-400 font-medium">{scoredA.team_name.split(" ").at(-1)}</span>
                            {" wins "}{aEdges}{" of "}{total}{" categories · "}
                            <span className="text-violet-400 font-medium">{scoredB.team_name.split(" ").at(-1)}</span>
                            {" wins "}{total - aEdges}
                          </p>
                        );
                      })()}
                    </div>
                  )}

                  {/* Full metrics comparison */}
                  {teamADetail && teamBDetail && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-white">Advanced Metrics</p>
                        <div className="flex items-center gap-3 text-2xs text-slate-600">
                          <span className="text-blue-500">{scoredA.team_name.split(" ").at(-1)}</span>
                          <span className="text-violet-500">{scoredB.team_name.split(" ").at(-1)}</span>
                        </div>
                      </div>
                      {/* Column headers */}
                      <div className="grid grid-cols-[1fr_80px_1fr] text-2xs text-slate-600 px-3 pb-1">
                        <span className="text-right">{scoredA.team_name.split(" ").at(-1)}</span>
                        <span className="text-center">Metric</span>
                        <span>{scoredB.team_name.split(" ").at(-1)}</span>
                      </div>
                      <MetricsTable
                        teamADetail={teamADetail}
                        teamBDetail={teamBDetail}
                        nameA={scoredA.team_name}
                        nameB={scoredB.team_name}
                      />
                    </div>
                  )}

                  {/* Explanation */}
                  {matchup.explanation && (
                    <div className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-3">
                      <p className="text-xs font-semibold text-white">The Pick</p>
                      <div className="flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-300 leading-relaxed">{matchup.explanation}</p>
                      </div>
                      {matchup.top_reasons.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-surface-border">
                          <p className="text-2xs text-slate-600 uppercase tracking-widest">Key reasons</p>
                          {matchup.top_reasons.map((r) => (
                            <div key={r} className="flex items-start gap-1.5 text-xs text-slate-300">
                              <ChevronRight className="w-3 h-3 text-brand-light shrink-0 mt-0.5" />
                              {r}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                </>
              )}

              {/* No-team placeholder */}
              {!loading && !error && (!game.team_a || !game.team_b) && (
                <div className="py-12 text-center text-slate-600 text-sm">
                  Teams not yet determined for this matchup.
                </div>
              )}

            </div>
          </>
        )}
      </div>
    </>
  );
}
