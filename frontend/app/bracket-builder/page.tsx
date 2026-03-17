"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Trophy, Zap, RotateCcw, ChevronDown, Loader2, AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api, BracketResponse, BracketGameOut } from "@/lib/api";
import { BracketView } from "@/components/bracket/BracketView";
import { MatchupDrawer } from "@/components/matchup/MatchupDrawer";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROFILES = [
  { value: "balanced",      label: "Balanced"      },
  { value: "offense-heavy", label: "Offense-Heavy"  },
  { value: "defense-heavy", label: "Defense-Heavy"  },
  { value: "upset-hunter",  label: "Upset Hunter"   },
];

const ROUND_SHORT: Record<string, string> = {
  "First Four":    "First Four",
  "Round of 64":   "R64",
  "Round of 32":   "R32",
  "Sweet Sixteen": "Sweet 16",
  "Elite Eight":   "Elite 8",
  "Final Four":    "Final Four",
  "Championship":  "Championship",
};

const CONFIDENCE_VARIANT: Record<string, "slate" | "blue" | "amber" | "green"> = {
  "toss-up":        "slate",
  "slight edge":    "blue",
  "moderate edge":  "amber",
  "clear favorite": "green",
  "heavy favorite": "green",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isUpset(game: BracketGameOut): boolean {
  if (!game.winner || !game.loser) return false;
  return (game.winner.seed ?? 99) > (game.loser.seed ?? 99);
}

function allGames(bracket: BracketResponse): BracketGameOut[] {
  return bracket.rounds.flatMap((r) => r.games);
}

// ─── Champion path strip ──────────────────────────────────────────────────────

function ChampionPath({
  bracket,
  onGameClick,
}: {
  bracket:     BracketResponse;
  onGameClick: (g: BracketGameOut) => void;
}) {
  if (!bracket.champion) return null;

  const path = bracket.rounds
    .flatMap((r) => r.games)
    .filter((g) => g.winner?.team_id === bracket.champion!.team_id)
    .sort((a, b) => a.round_num - b.round_num);

  if (path.length === 0) return null;

  return (
    <SectionCard
      title="Champion's Path"
      description={`${bracket.champion.team_name} · ${path.length} wins`}
    >
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {path.map((game) => {
          const opp = game.winner?.team_id === game.team_a?.team_id ? game.team_b : game.team_a;
          const upset = isUpset(game);
          return (
            <button
              key={game.game_id}
              onClick={() => onGameClick(game)}
              className="shrink-0 w-40 rounded-xl border border-surface-border bg-surface-overlay p-3 space-y-1.5 text-left hover:border-brand/40 hover:bg-surface-card transition-colors focus:outline-none focus:ring-1 focus:ring-brand/40"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-2xs text-slate-500 font-medium truncate">
                  {ROUND_SHORT[game.round_name] ?? game.round_name}
                </span>
                {game.score_gap != null && (
                  <span className="text-2xs font-mono text-slate-600">+{game.score_gap.toFixed(1)}</span>
                )}
              </div>
              <div className="space-y-px">
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-brand-light font-mono text-2xs">W</span>
                  <span className="text-white font-medium truncate">
                    {bracket.champion!.team_name.split(" ").at(-1)}
                  </span>
                </div>
                {opp && (
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-slate-700 font-mono text-2xs">L</span>
                    <span className="text-slate-500 truncate">
                      #{opp.seed} {opp.team_name.split(" ").at(-1)}
                    </span>
                  </div>
                )}
              </div>
              {game.confidence && (
                <Badge variant={CONFIDENCE_VARIANT[game.confidence] ?? "slate"} className="text-2xs w-full justify-center">
                  {game.confidence}
                  {upset && " · upset"}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function BracketSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-900/30 bg-amber-950/10 px-5 py-4 flex items-center gap-4">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="rounded-xl border border-surface-border bg-surface-card p-4 overflow-x-auto">
        <div className="flex gap-3 min-w-max">
          {Array.from({ length: 9 }).map((_, col) => (
            <div key={col} className="flex flex-col gap-2" style={{ width: 168 }}>
              <Skeleton className="h-4 w-20 mx-auto" />
              {Array.from({ length: col === 4 ? 3 : 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page content ─────────────────────────────────────────────────────────────

function BracketBuilderContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlProfile   = searchParams.get("profile") ?? "balanced";
  const urlSeason    = Number(searchParams.get("season")) || 2026;

  const [profile, setProfile]     = useState(urlProfile);
  const season                    = urlSeason;
  const [bracket, setBracket]     = useState<BracketResponse | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error,   setError]       = useState<string | null>(null);
  const [activeGame, setActiveGame] = useState<BracketGameOut | null>(null);

  async function fetchBracket(p = profile) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.bracket(season, p);
      setBracket(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchBracket(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function changeProfile(p: string) {
    setProfile(p);
    const params = new URLSearchParams(searchParams.toString());
    params.set("profile", p);
    router.replace(`/bracket-builder?${params}`, { scroll: false });
  }

  function reset() {
    changeProfile("balanced");
    fetchBracket("balanced");
  }

  const stats = useMemo(() => {
    if (!bracket) return null;
    const games  = allGames(bracket);
    const upsets = games.filter(isUpset);
    const biggestUpset = upsets.reduce<BracketGameOut | null>((best, g) => {
      if (!g.winner?.seed) return best;
      if (!best?.winner?.seed) return g;
      return g.winner.seed > best.winner.seed ? g : best;
    }, null);
    const played  = games.filter((g) => g.winner != null);
    const avgGap  = played.length > 0
      ? played.reduce((s, g) => s + (g.score_gap ?? 0), 0) / played.length
      : 0;
    return { upsets: upsets.length, biggestUpset, avgGap, totalGames: played.length };
  }, [bracket]);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Bracket Builder"
        subtitle={`Simulated with the ${profile} profile · ${season} season · click any matchup to analyze`}
        badge={<Badge variant="amber" dot>{season} NCAA Tournament</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                className="appearance-none bg-surface-card border border-surface-border text-slate-300 text-xs rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand/50"
                value={profile}
                onChange={(e) => changeProfile(e.target.value)}
              >
                {PROFILES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>
            <button
              onClick={reset}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card hover:bg-surface-overlay border border-surface-border text-slate-300 hover:text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-40"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
            <button
              onClick={() => fetchBracket()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              {loading ? "Simulating…" : "Auto-Fill"}
            </button>
          </div>
        }
      />

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {error} — is the backend running?
        </div>
      )}

      {/* ── Loading ────────────────────────────────────────────────────────── */}
      {loading && !bracket && <BracketSkeleton />}

      {/* ── Loaded bracket ─────────────────────────────────────────────────── */}
      {bracket && (
        <div className="space-y-5">

          {/* Champion callout */}
          <div className="rounded-xl border border-amber-900/40 bg-amber-950/15 px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-900/40 border border-amber-800/40 flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-2xs text-amber-500/80 uppercase tracking-widest font-semibold">Projected Champion</p>
              <p className="text-lg font-bold text-white mt-0.5 truncate">{bracket.champion?.team_name}</p>
              <p className="text-xs text-slate-400">
                #{bracket.champion?.seed} {bracket.champion?.region} · {bracket.profile} profile
              </p>
            </div>
            {stats && (
              <div className="ml-auto hidden sm:flex items-center gap-5 text-xs text-slate-500 shrink-0">
                <div className="text-center">
                  <p className="text-base font-bold text-slate-300 font-mono">{stats.totalGames}</p>
                  <p className="text-2xs">games</p>
                </div>
                <div className="text-center">
                  <p className={cn("text-base font-bold font-mono", stats.upsets > 0 ? "text-orange-400" : "text-slate-300")}>
                    {stats.upsets}
                  </p>
                  <p className="text-2xs">upsets</p>
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-slate-300 font-mono">{stats.avgGap.toFixed(1)}</p>
                  <p className="text-2xs">avg gap</p>
                </div>
              </div>
            )}
          </div>

          {/* Biggest upset banner */}
          {stats?.biggestUpset && (
            <div className="rounded-lg border border-orange-900/40 bg-orange-950/10 px-4 py-3 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
              <p className="text-xs text-slate-400">
                <span className="text-orange-300 font-semibold">Biggest upset: </span>
                #{stats.biggestUpset.winner?.seed} {stats.biggestUpset.winner?.team_name.split(" ").at(-1)} over
                #{stats.biggestUpset.loser?.seed} {stats.biggestUpset.loser?.team_name.split(" ").at(-1)} — {stats.biggestUpset.round_name}
              </p>
            </div>
          )}

          {/* Champion path */}
          <ChampionPath bracket={bracket} onGameClick={setActiveGame} />

          {/* Bracket hint */}
          <p className="text-2xs text-slate-600 text-center">
            Click any matchup node to open the full analysis drawer
          </p>

          {/* Visual bracket */}
          <SectionCard padded={false}>
            <div className="p-4">
              <BracketView bracket={bracket} onGameClick={setActiveGame} />
            </div>
          </SectionCard>

        </div>
      )}

      {/* ── Matchup drawer ─────────────────────────────────────────────────── */}
      <MatchupDrawer
        game={activeGame}
        profile={profile}
        onClose={() => setActiveGame(null)}
      />

    </div>
  );
}

export default function BracketBuilderPage() {
  return (
    <div className="p-4 sm:p-6 max-w-[1800px] mx-auto">
      <Suspense>
        <BracketBuilderContent />
      </Suspense>
    </div>
  );
}
