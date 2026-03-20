"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, Star, ArrowUpRight, ArrowDownRight,
  Zap, Shield, TrendingUp, ChevronRight, Shuffle,
  BarChart2, Flame, ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api, RankedTeam, ProfileOut } from "@/lib/api";
import { Tooltip } from "@/components/ui/tooltip";
import { ProfileWeightBars } from "@/components/ui/profile-weight-bars";

// ─── Constants ────────────────────────────────────────────────────────────────

const SEASONS  = [2026];
const PROFILES = [
  { value: "balanced",      label: "Balanced",      icon: BarChart2,  color: "text-blue-400"   },
  { value: "offense-heavy", label: "Offense",        icon: Flame,      color: "text-orange-400" },
  { value: "defense-heavy", label: "Defense",        icon: ShieldCheck,color: "text-green-400"  },
  { value: "upset-hunter",  label: "Upset Hunter",   icon: Shuffle,    color: "text-violet-400" },
] as const;

// ─── Derived analysis ─────────────────────────────────────────────────────────

interface AnalyzedTeam {
  team: RankedTeam;
  /** Positive = ranked better than seed implies; negative = ranked worse */
  delta: number;
  /** Normalized 0–1: how much better than seed (pos) or worse (neg) */
  reasons: string[];
}

function analyzeTeams(teams: RankedTeam[]): AnalyzedTeam[] {
  const total = teams.length;
  if (total === 0) return [];

  return teams.map((team) => {
    const seed = team.seed ?? 16;
    // Expected rank based on seed: seed 1 → near top, seed 16 → near bottom
    // With 4 teams per seed group (64-team bracket), expectedRank ≈ (seed - 0.5) * 4
    const expectedRank = (seed - 0.5) * (total / 16);
    const delta = expectedRank - team.rank; // positive = better than seeded

    const p = team.metric_percentiles;
    const reasons: string[] = [];

    if (delta < -8) {
      // Vulnerable — underperforming seed
      if ((p.adj_o ?? 50) < 40) reasons.push("weak offense");
      if ((p.adj_d ?? 50) < 40) reasons.push("soft defense");
      if ((p.sos ?? 50) < 30)   reasons.push("weak schedule");
      if ((p.efg_pct ?? 50) < 35) reasons.push("poor shooting");
      if (reasons.length === 0)  reasons.push("metrics lag behind seeding");
    } else if (delta > 8) {
      // Cinderella — overperforming seed
      if ((p.adj_em ?? 50) > 70)    reasons.push("elite efficiency");
      if ((p.adj_d ?? 50) > 70)     reasons.push("stifling defense");
      if ((p.adj_o ?? 50) > 70)     reasons.push("dangerous offense");
      if ((p.sos ?? 50) > 65)       reasons.push("battle-tested");
      if ((p.tempo ?? 50) > 70)     reasons.push("forces chaos");
      if ((p.to_pct ?? 50) > 65)    reasons.push("protects the ball");
      if (reasons.length === 0)      reasons.push("metrics far outpace seed");
    }

    return { team, delta, reasons };
  });
}

// ─── Team card ────────────────────────────────────────────────────────────────

interface CardProps {
  item: AnalyzedTeam;
  variant: "vulnerable" | "cinderella" | "mismatch";
  searchParams: string;
}

function TeamCard({ item, variant, searchParams }: CardProps) {
  const { team, delta, reasons } = item;
  const seed = team.seed ?? "?";
  const isPositive = delta > 0;

  const deltaMag = Math.abs(delta).toFixed(0);
  const deltaLabel = isPositive
    ? `${deltaMag} spots above seed`
    : `${deltaMag} spots below seed`;

  const ringColor =
    variant === "vulnerable"  ? "border-red-900/60 hover:border-red-700/60" :
    variant === "cinderella"  ? "border-purple-900/60 hover:border-purple-700/60" :
    isPositive                ? "border-green-900/50 hover:border-green-700/50" :
                                "border-amber-900/50 hover:border-amber-700/50";

  const seedBadge =
    variant === "vulnerable" ? "amber" :
    variant === "cinderella" ? "purple" :
    "default";

  const deltaIcon = isPositive
    ? <ArrowUpRight className="w-3.5 h-3.5 text-green-400 shrink-0" />
    : <ArrowDownRight className="w-3.5 h-3.5 text-red-400 shrink-0" />;

  const deltaColor = isPositive ? "text-green-400" : "text-red-400";

  const regionLabel = team.region ?? "";

  return (
    <div
      className={cn(
        "shrink-0 w-56 rounded-xl border bg-surface-card p-4 space-y-3",
        "shadow-card transition-colors",
        ringColor
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 truncate">{regionLabel}</p>
          <p className="text-sm font-semibold text-white leading-snug truncate mt-0.5">
            {team.team_name}
          </p>
        </div>
        <Badge variant={seedBadge as "amber" | "purple" | "default"} className="shrink-0 text-2xs px-1.5">
          #{seed}
        </Badge>
      </div>

      {/* Rank + delta */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">Rank</span>
          <span className="text-xs font-mono font-semibold text-white">#{team.rank}</span>
          <span className="text-2xs text-slate-600">of {" "}</span>
          <span className="text-2xs font-mono text-slate-500">{team.march_score.toFixed(1)}</span>
        </div>
        <div className={cn("flex items-center gap-1 text-xs font-medium", deltaColor)}>
          {deltaIcon}
          <span>{deltaLabel}</span>
        </div>
      </div>

      {/* March score bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-2xs text-slate-600">
          <span>March Score</span>
          <span className="font-mono">{team.march_score.toFixed(1)}</span>
        </div>
        <div className="h-1 rounded-full bg-surface-overlay overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full",
              variant === "vulnerable" ? "bg-red-500" :
              variant === "cinderella" ? "bg-purple-500" :
              isPositive ? "bg-green-500" : "bg-amber-500"
            )}
            style={{ width: `${team.march_score}%` }}
          />
        </div>
      </div>

      {/* Reason tags */}
      {reasons.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {reasons.slice(0, 3).map((r) => (
            <span
              key={r}
              className="text-2xs px-1.5 py-0.5 rounded-md bg-surface-overlay text-slate-400 border border-surface-border"
            >
              {r}
            </span>
          ))}
        </div>
      )}

      {/* CTA */}
      <Link
        href={`/matchup-analyzer?${searchParams}`}
        className="flex items-center gap-1 text-2xs text-slate-500 hover:text-brand-light transition-colors group"
      >
        <span>Run Matchup</span>
        <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  );
}

// ─── Section scroll row ───────────────────────────────────────────────────────

function CardRow({
  items,
  variant,
  searchParams,
  emptyMessage,
}: {
  items: AnalyzedTeam[];
  variant: "vulnerable" | "cinderella" | "mismatch";
  searchParams: string;
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-500 italic">{emptyMessage}</p>
    );
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
      {items.map((item) => (
        <TeamCard
          key={item.team.team_id}
          item={item}
          variant={variant}
          searchParams={searchParams}
        />
      ))}
    </div>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function SectionSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="shrink-0 w-56 rounded-xl border border-surface-border bg-surface-card p-4 space-y-3"
        >
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-1 w-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function SummaryStrip({
  vulnerable,
  cinderellas,
  mismatches,
}: {
  vulnerable: number;
  cinderellas: number;
  mismatches: number;
}) {
  const stats = [
    { label: "Vulnerable favorites", value: vulnerable, icon: AlertTriangle, color: "text-red-400" },
    { label: "Cinderella candidates", value: cinderellas, icon: Star, color: "text-purple-400" },
    { label: "Seed mismatches", value: mismatches, icon: Zap, color: "text-amber-400" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {stats.map(({ label, value, icon: Icon, color }) => (
        <div
          key={label}
          className="rounded-xl border border-surface-border bg-surface-card p-4 text-center space-y-1"
        >
          <Icon className={cn("w-4 h-4 mx-auto", color)} />
          <p className={cn("text-2xl font-bold font-mono", color)}>{value}</p>
          <p className="text-2xs text-slate-500">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Inner page (uses useSearchParams) ───────────────────────────────────────

function UpsetFinderInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [season,       setSeason]       = useState<number>(2026);
  const [profile,      setProfile]      = useState<string>("balanced");
  const [teams,        setTeams]        = useState<RankedTeam[] | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [profilesData, setProfilesData] = useState<ProfileOut[]>([]);

  useEffect(() => {
    api.profiles().then((r) => setProfilesData(r.profiles)).catch(() => {});
  }, []);

  function getWeights(profileValue: string): Record<string, number> {
    return profilesData.find((p) => p.name === profileValue)?.weights ?? {};
  }

  // Read URL params on mount
  useEffect(() => {
    const s = searchParams.get("season");
    const p = searchParams.get("profile");
    if (s && SEASONS.includes(Number(s) as typeof SEASONS[number])) setSeason(Number(s));
    if (p) setProfile(p);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch rankings when season/profile changes
  useEffect(() => {
    setLoading(true);
    setError(null);
    api.rankings(season, profile)
      .then((res) => setTeams(res.teams))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [season, profile]);

  function updateParam(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString());
    p.set(key, value);
    router.replace(`?${p.toString()}`);
  }

  const analyzed = useMemo(() => analyzeTeams(teams ?? []), [teams]);

  // Vulnerable favorites: seeds 1–5, ranked worse than seed implies (negative delta)
  const vulnerableFavorites = useMemo(
    () =>
      analyzed
        .filter((a) => (a.team.seed ?? 99) <= 5 && a.delta < -6)
        .sort((a, b) => a.delta - b.delta) // most negative first
        .slice(0, 8),
    [analyzed]
  );

  // Cinderella candidates: seeds 9–16, ranked better than seed implies (positive delta)
  const cinderellas = useMemo(
    () =>
      analyzed
        .filter((a) => (a.team.seed ?? 0) >= 9 && a.delta > 6)
        .sort((a, b) => b.delta - a.delta) // most positive first
        .slice(0, 8),
    [analyzed]
  );

  // Biggest mismatches: all seeds, sorted by |delta|
  const mismatches = useMemo(
    () =>
      analyzed
        .filter((a) => Math.abs(a.delta) > 8)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 10),
    [analyzed]
  );

  const sharedParams = `season=${season}&profile=${profile}`;

  const activeProfileMeta = PROFILES.find((p) => p.value === profile);
  const ActiveIcon = activeProfileMeta?.icon ?? BarChart2;

  return (
    <div className="flex flex-col gap-6">

      {/* Page header */}
      <PageHeader
        title="Upset Finder"
        subtitle="Surface vulnerable favorites and dangerous lower seeds before you fill out your bracket."
        badge={
          <Badge variant="amber" dot>
            {teams ? `${teams.length} teams analyzed` : "Loading…"}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Season pills */}
            <div className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-overlay p-0.5">
              {SEASONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setSeason(s); updateParam("season", String(s)); }}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                    s === season
                      ? "bg-brand text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Profile pills */}
            <div className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-overlay p-0.5">
              {PROFILES.map(({ value, label, icon: Icon, color }) => {
                const weights = getWeights(value);
                const hasWeights = Object.keys(weights).length > 0;
                return (
                  <Tooltip
                    key={value}
                    side="below"
                    content={hasWeights ? (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">{label} weights</p>
                        <ProfileWeightBars weights={weights} />
                      </div>
                    ) : null}
                  >
                    <button
                      onClick={() => { setProfile(value); updateParam("profile", value); }}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                        value === profile
                          ? "bg-surface-card text-white shadow"
                          : "text-slate-500 hover:text-slate-300"
                      )}
                    >
                      <Icon className={cn("w-3 h-3", value === profile ? color : "text-slate-500")} />
                      <span className="hidden sm:block">{label}</span>
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        }
      />

      {/* Active profile context */}
      {activeProfileMeta && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <ActiveIcon className={cn("w-3.5 h-3.5", activeProfileMeta.color)} />
          <span>
            Analyzing with <span className={cn("font-medium", activeProfileMeta.color)}>{activeProfileMeta.label}</span> profile
            — seed vs. metric gaps shift as weights change.
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-5 py-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Summary strip */}
      {!loading && !error && (
        <SummaryStrip
          vulnerable={vulnerableFavorites.length}
          cinderellas={cinderellas.length}
          mismatches={mismatches.length}
        />
      )}
      {loading && (
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-2">
              <Skeleton className="h-4 w-8 mx-auto" />
              <Skeleton className="h-6 w-12 mx-auto" />
              <Skeleton className="h-3 w-24 mx-auto" />
            </div>
          ))}
        </div>
      )}

      {/* ── Section 1: Vulnerable Favorites ─────────────────────────────────── */}
      <SectionCard
        title="Most Vulnerable Favorites"
        description="High-seeded teams whose metrics suggest they are over-seeded — prime upset targets."
        action={
          <div className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Seeds 1–5</span>
          </div>
        }
      >
        {loading ? (
          <SectionSkeleton />
        ) : (
          <CardRow
            items={vulnerableFavorites}
            variant="vulnerable"
            searchParams={sharedParams}
            emptyMessage="No vulnerable favorites detected with this profile."
          />
        )}
      </SectionCard>

      {/* ── Section 2: Cinderella Candidates ─────────────────────────────────── */}
      <SectionCard
        title="Best Cinderella Candidates"
        description="Lower seeds whose march score ranks far above their bracket placement — dangerous teams to ignore."
        action={
          <div className="flex items-center gap-1.5 text-xs text-purple-400">
            <Star className="w-3.5 h-3.5" />
            <span>Seeds 9–16</span>
          </div>
        }
      >
        {loading ? (
          <SectionSkeleton />
        ) : (
          <CardRow
            items={cinderellas}
            variant="cinderella"
            searchParams={sharedParams}
            emptyMessage="No Cinderella candidates detected with this profile."
          />
        )}
      </SectionCard>

      {/* ── Section 3: Biggest Seed Mismatches ──────────────────────────────── */}
      <SectionCard
        title="Biggest Seed vs. Metric Mismatches"
        description="Teams — at any seed — where the bracket committee and the metrics disagree the most."
        action={
          <div className="flex items-center gap-1.5 text-xs text-amber-400">
            <Zap className="w-3.5 h-3.5" />
            <span>All seeds</span>
          </div>
        }
      >
        {loading ? (
          <SectionSkeleton />
        ) : (
          <CardRow
            items={mismatches}
            variant="mismatch"
            searchParams={sharedParams}
            emptyMessage="No significant mismatches detected with this profile."
          />
        )}
      </SectionCard>

      {/* ── How to use ─────────────────────────────────────────────────────── */}
      <SectionCard title="How to use this page">
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          {[
            {
              icon: AlertTriangle,
              color: "text-red-400",
              heading: "Vulnerable Favorites",
              body: "Teams seeded 1–5 where march score ranks significantly lower than their seed. Pick an opponent over them for an upset.",
            },
            {
              icon: Star,
              color: "text-purple-400",
              heading: "Cinderella Candidates",
              body: "Seeds 9–16 with march scores far above their bracket slot. Consider them for deep runs — especially in the right matchup.",
            },
            {
              icon: Zap,
              color: "text-amber-400",
              heading: "Seed Mismatches",
              body: "All teams with the largest gap between seed and march score ranking. Green = better than seeded. Amber = worse.",
            },
          ].map(({ icon: Icon, color, heading, body }) => (
            <div key={heading} className="flex gap-3">
              <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", color)} />
              <div className="space-y-1">
                <p className="text-white font-medium text-xs">{heading}</p>
                <p className="text-slate-500 text-xs leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

    </div>
  );
}

// ─── Page (Suspense wrapper required for useSearchParams) ────────────────────

export default function UpsetFinderPage() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <Suspense fallback={<div className="text-slate-500 text-sm">Loading…</div>}>
        <UpsetFinderInner />
      </Suspense>
    </div>
  );
}
