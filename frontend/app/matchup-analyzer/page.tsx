"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Swords, ChevronDown, Zap, Trophy, Info, Loader2,
  BarChart2, Flame, Shield, Lock, ArrowUpDown,
  CheckCircle2, MinusCircle, ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api, TeamOut, MatchupResponse, MatchupTeamOut, CategoryEdgeOut, ProfileOut } from "@/lib/api";
import { ProfileWeightBars } from "@/components/ui/profile-weight-bars";

// ─── Constants ────────────────────────────────────────────────────────────────

const SEASON = 2026;

const PROFILES = [
  { value: "balanced",      label: "Balanced"      },
  { value: "offense-heavy", label: "Offense-Heavy"  },
  { value: "defense-heavy", label: "Defense-Heavy"  },
  { value: "upset-hunter",  label: "Upset Hunter"   },
];

const REGION_VARIANT: Record<string, "blue" | "green" | "amber" | "purple"> = {
  East: "blue", West: "green", South: "amber", Midwest: "purple",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  "toss-up":         "Toss-Up",
  "slight edge":     "Slight Edge",
  "moderate edge":   "Moderate Edge",
  "clear favorite":  "Clear Favorite",
  "heavy favorite":  "Heavy Favorite",
};

const CONFIDENCE_VARIANT: Record<string, "slate" | "blue" | "amber" | "green" | "red"> = {
  "toss-up":        "slate",
  "slight edge":    "blue",
  "moderate edge":  "amber",
  "clear favorite": "green",
  "heavy favorite": "green",
};

// Map category slugs/labels to icons
function categoryIcon(category: string) {
  const s = category.toLowerCase();
  if (s.includes("offens") || s.includes("output"))  return Flame;
  if (s.includes("defens") || s.includes("strength")) return Shield;
  if (s.includes("ball") || s.includes("security") || s.includes("turnover")) return Lock;
  if (s.includes("rebound"))                          return ArrowUpDown;
  return BarChart2; // overall efficiency
}

// ─── Team selector panel ──────────────────────────────────────────────────────

function TeamPanel({
  side,
  teams,
  selectedId,
  onSelect,
  scored,
  isWinner,
  hasResult,
}: {
  side:       "A" | "B";
  teams:      TeamOut[];
  selectedId: number | null;
  onSelect:   (id: number) => void;
  scored?:    MatchupTeamOut;
  isWinner:   boolean;
  hasResult:  boolean;
}) {
  const isA    = side === "A";
  const color  = isA ? "blue" : "violet";
  const accent = isA ? "border-blue-900/40 bg-blue-950/15" : "border-violet-900/40 bg-violet-950/15";
  const labelColor = isA ? "text-blue-400" : "text-violet-400";
  const scoreColor = isA ? "text-blue-300" : "text-violet-300";
  const winBorder  = isA
    ? "border-blue-700/60 bg-blue-950/25"
    : "border-violet-700/60 bg-violet-950/25";

  const sel = teams.find((t) => t.team_id === selectedId);

  return (
    <div className={cn(
      "rounded-xl border p-5 space-y-4 transition-colors",
      hasResult && isWinner ? winBorder : accent
    )}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("text-2xs font-semibold uppercase tracking-widest", labelColor)}>
            Team {side}
          </span>
          {hasResult && isWinner && (
            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-amber-400">
              <Trophy className="w-3 h-3" /> Pick
            </span>
          )}
        </div>
        {sel && (
          <Badge variant={REGION_VARIANT[sel.region ?? ""] ?? "slate"}>
            #{sel.seed} {sel.region}
          </Badge>
        )}
      </div>

      {/* Team dropdown */}
      <div className="relative">
        <select
          className="w-full appearance-none bg-surface-card border border-surface-border text-slate-200 text-sm rounded-lg px-3 py-2.5 pr-8 focus:outline-none focus:ring-1 focus:ring-brand/50"
          value={selectedId ?? ""}
          onChange={(e) => onSelect(Number(e.target.value))}
        >
          <option value="" disabled>Select a team…</option>
          {teams.map((t) => (
            <option key={t.team_id} value={t.team_id}>
              {t.team_name} (#{t.seed} {t.region})
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
      </div>

      {/* Stats row */}
      {sel && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-surface-card border border-surface-border px-3 py-2 text-center">
            <p className="text-2xs text-slate-500 uppercase tracking-wide">Record</p>
            <p className="text-sm font-bold font-mono text-slate-200 mt-0.5">{sel.record}</p>
          </div>
          <div className="rounded-lg bg-surface-card border border-surface-border px-3 py-2 text-center">
            <p className="text-2xs text-slate-500 uppercase tracking-wide">March Score</p>
            <p className={cn("text-sm font-bold font-mono mt-0.5", scored ? scoreColor : "text-slate-500")}>
              {scored ? scored.march_score.toFixed(1) : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Conference */}
      {sel && (
        <p className="text-2xs text-slate-600 text-center">{sel.conference}</p>
      )}
    </div>
  );
}

// ─── Category row ─────────────────────────────────────────────────────────────

function CategoryRow({
  cat,
  teamAName,
  teamBName,
}: {
  cat:       CategoryEdgeOut;
  teamAName: string;
  teamBName: string;
}) {
  const aScore    = Math.max(0, Math.min(100, cat.team_a_score));
  const bScore    = Math.max(0, Math.min(100, cat.team_b_score));
  const aWins     = aScore > bScore;
  const bWins     = bScore > aScore;
  const Icon      = categoryIcon(cat.category);

  return (
    <div className="space-y-2">
      {/* Label row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="text-xs text-slate-400">{cat.label}</span>
        </div>
        <span className="text-2xs text-slate-600">{cat.edge_strength}</span>
      </div>

      {/* Dual bar with scores */}
      <div className="flex items-center gap-2">
        {/* Team A score */}
        <span className={cn("text-xs font-mono tabular-nums w-8 text-right shrink-0", aWins ? "text-blue-400 font-bold" : "text-slate-600")}>
          {aScore.toFixed(0)}
        </span>

        {/* Bars */}
        <div className="flex flex-1 gap-0.5 h-2 rounded-full overflow-hidden bg-surface-overlay">
          {/* A bar — grows inward from left */}
          <div className="flex-1 flex justify-end bg-transparent overflow-hidden">
            <div
              className={cn("h-full rounded-l-full transition-[width] duration-500", aWins ? "bg-blue-500" : "bg-blue-900/50")}
              style={{ width: `${aScore}%` }}
            />
          </div>
          <div className="w-px bg-surface-border shrink-0" />
          {/* B bar — grows inward from right */}
          <div className="flex-1 overflow-hidden">
            <div
              className={cn("h-full rounded-r-full transition-[width] duration-500", bWins ? "bg-violet-500" : "bg-violet-900/50")}
              style={{ width: `${bScore}%` }}
            />
          </div>
        </div>

        {/* Team B score */}
        <span className={cn("text-xs font-mono tabular-nums w-8 shrink-0", bWins ? "text-violet-400 font-bold" : "text-slate-600")}>
          {bScore.toFixed(0)}
        </span>
      </div>

      {/* Edge label under bars */}
      <div className="flex justify-between text-2xs px-10">
        {aWins ? (
          <span className="text-blue-500 font-medium flex items-center gap-0.5">
            <CheckCircle2 className="w-2.5 h-2.5" />
            {teamAName.split(" ").at(-1)} edge
          </span>
        ) : (
          <span className="text-slate-700">—</span>
        )}
        {bWins ? (
          <span className="text-violet-500 font-medium flex items-center gap-0.5">
            {teamBName.split(" ").at(-1)} edge
            <CheckCircle2 className="w-2.5 h-2.5" />
          </span>
        ) : (
          <span className="text-slate-700">—</span>
        )}
      </div>
    </div>
  );
}

// ─── Winner banner ────────────────────────────────────────────────────────────

function WinnerBanner({
  result,
  scoredA,
  scoredB,
}: {
  result:  MatchupResponse;
  scoredA: MatchupTeamOut;
  scoredB: MatchupTeamOut;
}) {
  const conf       = result.confidence ?? "";
  const confLabel  = CONFIDENCE_LABEL[conf] ?? conf;
  const confVariant = CONFIDENCE_VARIANT[conf] ?? "slate";

  // Score gap bar: winner width relative to total
  const total     = scoredA.march_score + scoredB.march_score;
  const aFrac     = total > 0 ? (scoredA.march_score / total) * 100 : 50;

  return (
    <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-5 space-y-5">
      {/* Title */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-900/40 border border-amber-800/40 flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-2xs text-amber-500/80 uppercase tracking-widest font-semibold">Projected Winner</p>
            <p className="text-base font-bold text-white">{result.winner.team_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={confVariant}>{confLabel}</Badge>
          <Badge variant={REGION_VARIANT[result.winner.region ?? ""] ?? "slate"}>
            #{result.winner.seed} {result.winner.region}
          </Badge>
        </div>
      </div>

      {/* Score comparison */}
      <div className="space-y-2">
        <div className="flex items-end justify-between">
          <div className="text-center space-y-0.5">
            <p className="text-2xs text-slate-500 truncate max-w-[120px]">{scoredA.team_name}</p>
            <p className={cn(
              "text-3xl font-bold font-mono tabular-nums",
              result.winner.team_id === scoredA.team_id ? "text-blue-300" : "text-slate-600"
            )}>
              {scoredA.march_score.toFixed(1)}
            </p>
          </div>

          <div className="text-center px-4 space-y-1">
            <p className="text-2xs text-slate-600 font-mono">gap</p>
            <p className="text-lg font-bold text-slate-400 font-mono">
              {result.score_gap.toFixed(1)}
            </p>
          </div>

          <div className="text-center space-y-0.5">
            <p className="text-2xs text-slate-500 truncate max-w-[120px]">{scoredB.team_name}</p>
            <p className={cn(
              "text-3xl font-bold font-mono tabular-nums",
              result.winner.team_id === scoredB.team_id ? "text-violet-300" : "text-slate-600"
            )}>
              {scoredB.march_score.toFixed(1)}
            </p>
          </div>
        </div>

        {/* Gap bar */}
        <div className="h-2 rounded-full bg-surface-overlay overflow-hidden flex">
          <div
            className="h-full bg-blue-600 transition-[width] duration-700"
            style={{ width: `${aFrac}%` }}
          />
          <div
            className="h-full bg-violet-600 transition-[width] duration-700"
            style={{ width: `${100 - aFrac}%` }}
          />
        </div>
        <div className="flex justify-between text-2xs text-slate-600">
          <span>{scoredA.team_name.split(" ").at(-1)}</span>
          <span>{scoredB.team_name.split(" ").at(-1)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function MatchupAnalyzerContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlProfile   = searchParams.get("profile") ?? "balanced";
  const urlSeason    = Number(searchParams.get("season")) || SEASON;

  const [teams, setTeams]       = useState<TeamOut[]>([]);
  const [teamAId, setTeamAId]   = useState<number | null>(null);
  const [teamBId, setTeamBId]   = useState<number | null>(null);
  const [profile, setProfile]   = useState(urlProfile);

  const [result, setResult]     = useState<MatchupResponse | null>(null);
  const [lastAId, setLastAId]   = useState<number | null>(null); // A at time of last run

  const [teamsLoading, setTeamsLoading] = useState(true);
  const [running, setRunning]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [profilesData, setProfilesData] = useState<ProfileOut[]>([]);

  useEffect(() => {
    api.profiles().then((r) => setProfilesData(r.profiles)).catch(() => {});
  }, []);

  const activeProfileWeights = profilesData.find((p) => p.name === profile)?.weights ?? {};

  useEffect(() => {
    api.teams(urlSeason)
      .then((data) => {
        setTeams(data.teams);
        if (data.teams.length >= 2) {
          setTeamAId(data.teams[0].team_id);
          setTeamBId(data.teams[1].team_id);
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setTeamsLoading(false));
  }, [urlSeason]);

  // When profile changes, clear stale result
  useEffect(() => {
    setResult(null);
  }, [profile]);

  function changeProfile(p: string) {
    setProfile(p);
    const params = new URLSearchParams(searchParams.toString());
    params.set("profile", p);
    router.replace(`/matchup-analyzer?${params}`, { scroll: false });
  }

  async function runAnalysis() {
    if (!teamAId || !teamBId) return;
    if (teamAId === teamBId) { setError("Select two different teams."); return; }
    setRunning(true);
    setError(null);
    setLastAId(teamAId);
    try {
      const data = await api.matchup(teamAId, teamBId, profile);
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  // Resolve which scored team was A and which was B
  const scoredA = result && lastAId != null
    ? (result.winner.team_id === lastAId ? result.winner : result.loser)
    : null;
  const scoredB = result && lastAId != null
    ? (result.winner.team_id === lastAId ? result.loser : result.winner)
    : null;

  const winnerIsA = result != null && scoredA != null && result.winner.team_id === scoredA.team_id;
  const winnerIsB = result != null && scoredB != null && result.winner.team_id === scoredB.team_id;
  const hasResult = result != null && scoredA != null && scoredB != null;

  const canRun = !teamsLoading && !running && teamAId != null && teamBId != null && teamAId !== teamBId;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Matchup Analyzer"
        subtitle="Compare any two teams head-to-head and get a data-driven pick."
        badge={<Badge variant="purple" dot>Head-to-Head Engine</Badge>}
      />

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
          <MinusCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Team selectors ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_56px_1fr] gap-4 items-stretch">
        <TeamPanel
          side="A" teams={teams} selectedId={teamAId} onSelect={setTeamAId}
          scored={scoredA ?? undefined} isWinner={winnerIsA} hasResult={hasResult}
        />

        {/* VS divider */}
        <div className="hidden lg:flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-px h-10 bg-gradient-to-b from-transparent via-slate-700 to-transparent" />
            <div className="w-9 h-9 rounded-full bg-surface-overlay border border-surface-border flex items-center justify-center">
              <Swords className="w-4 h-4 text-slate-500" />
            </div>
            <div className="w-px h-10 bg-gradient-to-b from-transparent via-slate-700 to-transparent" />
          </div>
        </div>

        <TeamPanel
          side="B" teams={teams} selectedId={teamBId} onSelect={setTeamBId}
          scored={scoredB ?? undefined} isWinner={winnerIsB} hasResult={hasResult}
        />
      </div>

      {/* ── Controls bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-surface-border bg-surface-card px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 whitespace-nowrap">Weight Profile</span>
          <div className="relative">
            <select
              className="appearance-none bg-surface-overlay border border-surface-border text-slate-200 text-sm rounded-lg px-3 py-1.5 pr-7 focus:outline-none focus:ring-1 focus:ring-brand/50"
              value={profile}
              onChange={(e) => changeProfile(e.target.value)}
            >
              {PROFILES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* Legend */}
        {hasResult && (
          <div className="flex items-center gap-4 text-2xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              {scoredA?.team_name.split(" ").at(-1)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
              {scoredB?.team_name.split(" ").at(-1)}
            </span>
          </div>
        )}

        <button
          onClick={runAnalysis}
          disabled={!canRun}
          className={cn(
            "ml-auto inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors",
            canRun
              ? "bg-brand hover:bg-brand-dark text-white"
              : "bg-surface-overlay text-slate-600 cursor-not-allowed"
          )}
        >
          {running
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing…</>
            : <><Zap className="w-3.5 h-3.5" /> Analyze Matchup</>
          }
        </button>
      </div>

      {/* ── Active profile weight breakdown ────────────────────────────────── */}
      {Object.keys(activeProfileWeights).length > 0 && (
        <div className="rounded-xl border border-surface-border bg-surface-card px-4 py-3">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
            {PROFILES.find((p) => p.value === profile)?.label ?? profile} — stat weights
          </p>
          <ProfileWeightBars weights={activeProfileWeights} />
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {hasResult && scoredA && scoredB ? (
        <div className="space-y-4">

          {/* Winner banner */}
          <WinnerBanner result={result!} scoredA={scoredA} scoredB={scoredB} />

          {/* Category breakdown + reasons side-by-side */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">

            {/* Categories */}
            <SectionCard
              title="Category Breakdown"
              description="Head-to-head percentile scores across five key areas"
            >
              <div className="space-y-6">
                {result!.category_edges.map((cat) => (
                  <CategoryRow
                    key={cat.category}
                    cat={cat}
                    teamAName={scoredA.team_name}
                    teamBName={scoredB.team_name}
                  />
                ))}
              </div>

              {/* Category edge summary */}
              {(() => {
                const aEdges = result!.category_edges.filter(
                  (c) => c.team_a_score > c.team_b_score
                ).length;
                const bEdges = result!.category_edges.length - aEdges;
                return (
                  <div className="mt-5 pt-4 border-t border-surface-border flex items-center justify-between text-xs text-slate-500">
                    <span>
                      <span className="text-blue-400 font-semibold">{scoredA.team_name.split(" ").at(-1)}</span>
                      {" wins "}<span className="font-medium text-slate-300">{aEdges}</span>
                      {" of "}<span className="font-medium text-slate-300">{result!.category_edges.length}</span>
                      {" categories"}
                    </span>
                    <span>
                      <span className="text-violet-400 font-semibold">{scoredB.team_name.split(" ").at(-1)}</span>
                      {" wins "}<span className="font-medium text-slate-300">{bEdges}</span>
                    </span>
                  </div>
                );
              })()}
            </SectionCard>

            {/* Pick summary */}
            <div className="space-y-4">

              {/* Explanation */}
              <SectionCard title="The Pick">
                <div className="space-y-4">
                  <div className="flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-300 leading-relaxed">{result!.explanation}</p>
                  </div>

                  {result!.top_reasons.length > 0 && (
                    <div className="space-y-2 pt-1 border-t border-surface-border">
                      <p className="text-2xs text-slate-500 uppercase tracking-widest">Key reasons</p>
                      {result!.top_reasons.map((r) => (
                        <div key={r} className="flex items-start gap-2 text-xs text-slate-300">
                          <ChevronRight className="w-3 h-3 text-brand-light shrink-0 mt-0.5" />
                          {r}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* Head-to-head quick stats */}
              <SectionCard title="Head-to-Head">
                <div className="space-y-3">
                  {[
                    {
                      label: "March Score",
                      a: scoredA.march_score.toFixed(1),
                      b: scoredB.march_score.toFixed(1),
                      aWin: scoredA.march_score > scoredB.march_score,
                    },
                    {
                      label: "Record",
                      a: scoredA.record,
                      b: scoredB.record,
                      aWin: null,
                    },
                    {
                      label: "Seed",
                      a: `#${scoredA.seed}`,
                      b: `#${scoredB.seed}`,
                      aWin: (scoredA.seed ?? 99) < (scoredB.seed ?? 99),
                    },
                  ].map(({ label, a, b, aWin }) => (
                    <div key={label} className="grid grid-cols-[1fr_60px_1fr] gap-2 items-center">
                      <span className={cn("text-xs font-mono text-right", aWin === true ? "text-blue-400 font-bold" : "text-slate-400")}>
                        {a}
                      </span>
                      <span className="text-2xs text-slate-600 text-center">{label}</span>
                      <span className={cn("text-xs font-mono", aWin === false ? "text-violet-400 font-bold" : "text-slate-400")}>
                        {b}
                      </span>
                    </div>
                  ))}
                </div>
              </SectionCard>

            </div>
          </div>
        </div>
      ) : !running && (
        /* Empty state */
        <div className="rounded-xl border border-surface-border bg-surface-card py-16 flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-xl bg-surface-overlay border border-surface-border flex items-center justify-center">
            <Swords className="w-5 h-5 text-slate-500" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-300">Ready to simulate</p>
            <p className="text-xs text-slate-500 max-w-xs">
              Select Team A and Team B above, then click Analyze Matchup.
            </p>
          </div>
          <button
            onClick={runAnalysis}
            disabled={!canRun}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Zap className="w-3.5 h-3.5" /> Run Simulation
          </button>
        </div>
      )}

    </div>
  );
}

export default function MatchupAnalyzerPage() {
  return <Suspense><MatchupAnalyzerContent /></Suspense>;
}
