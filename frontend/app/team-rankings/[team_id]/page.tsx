"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Swords, Trophy, TrendingUp, TrendingDown,
  Minus, Shield, Flame, BarChart2, Activity, Repeat2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api, TeamDetailOut, RankedTeam, MetricsDict } from "@/lib/api";

// ─── Metric definitions ───────────────────────────────────────────────────────

type Section = "strength" | "offense" | "defense" | "possession" | "style";

interface MetricDef {
  key:          keyof MetricsDict;
  label:        string;
  shortLabel:   string;
  description:  string;
  higherBetter: boolean;
  format:       (v: number) => string;
  section:      Section;
}

const METRICS: MetricDef[] = [
  // Overall strength
  { key: "adj_em",      section: "strength",   label: "Adj. Efficiency Margin", shortLabel: "Adj EM",   description: "Net points per 100 possessions vs average opponent",           higherBetter: true,  format: (v) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)) },
  { key: "sos",         section: "strength",   label: "Strength of Schedule",   shortLabel: "SOS",      description: "Average efficiency margin of opponents faced",                  higherBetter: true,  format: (v) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)) },
  // Offense
  { key: "adj_o",       section: "offense",    label: "Adj. Offensive Eff.",    shortLabel: "Adj O",    description: "Points scored per 100 possessions vs average defense",           higherBetter: true,  format: (v) => v.toFixed(1) },
  { key: "efg_pct",     section: "offense",    label: "Eff. Field Goal %",      shortLabel: "eFG%",     description: "FG% weighted to value 3-pointers at 1.5× a 2-pointer",           higherBetter: true,  format: (v) => `${(v * 100).toFixed(1)}%` },
  { key: "ft_rate",     section: "offense",    label: "Free Throw Rate",        shortLabel: "FT Rate",  description: "Free throw attempts relative to field goal attempts",              higherBetter: true,  format: (v) => `${(v * 100).toFixed(1)}%` },
  // Defense
  { key: "adj_d",       section: "defense",    label: "Adj. Defensive Eff.",    shortLabel: "Adj D",    description: "Points allowed per 100 possessions vs average offense",           higherBetter: false, format: (v) => v.toFixed(1) },
  { key: "opp_efg_pct", section: "defense",    label: "Opp. eFG% Allowed",      shortLabel: "Opp FG%",  description: "Opponent effective FG% — lower means better shot defense",        higherBetter: false, format: (v) => `${(v * 100).toFixed(1)}%` },
  // Possession control
  { key: "to_pct",      section: "possession", label: "Turnover Rate",          shortLabel: "TO%",      description: "Turnovers per 100 possessions (lower = better ball security)",    higherBetter: false, format: (v) => `${(v * 100).toFixed(1)}%` },
  { key: "opp_to_pct",  section: "possession", label: "Forced Turnover Rate",   shortLabel: "Opp TO%",  description: "Opponent turnover rate — how often defense creates takeaways",    higherBetter: true,  format: (v) => `${(v * 100).toFixed(1)}%` },
  { key: "orb_pct",     section: "possession", label: "Off. Rebound %",         shortLabel: "ORB%",     description: "Share of available offensive rebounds captured",                   higherBetter: true,  format: (v) => `${(v * 100).toFixed(1)}%` },
  { key: "drb_pct",     section: "possession", label: "Def. Rebound %",         shortLabel: "DRB%",     description: "Share of available defensive rebounds captured",                   higherBetter: true,  format: (v) => `${(v * 100).toFixed(1)}%` },
  // Style
  { key: "tempo",       section: "style",      label: "Tempo",                  shortLabel: "Tempo",    description: "Adjusted possessions per 40 minutes — pace of play",              higherBetter: false, format: (v) => v.toFixed(1) },
];

const SECTION_META: Record<Section, { title: string; icon: React.ElementType; color: string }> = {
  strength:   { title: "Overall Strength",    icon: BarChart2,  color: "text-blue-400"   },
  offense:    { title: "Offense",             icon: Flame,      color: "text-orange-400" },
  defense:    { title: "Defense",             icon: Shield,     color: "text-green-400"  },
  possession: { title: "Possession Control",  icon: Repeat2,    color: "text-violet-400" },
  style:      { title: "Style & Tempo",       icon: Activity,   color: "text-slate-400"  },
};

const REGION_VARIANT: Record<string, "blue" | "green" | "amber" | "purple"> = {
  East: "blue", West: "green", South: "amber", Midwest: "purple",
};

// ─── Narrative generator ──────────────────────────────────────────────────────

interface StyleTag {
  label: string;
  color: "blue" | "green" | "amber" | "purple" | "slate";
}

function buildProfile(team: TeamDetailOut, ranked: RankedTeam | null): {
  narrative: string;
  tags: StyleTag[];
} {
  const pct = ranked?.metric_percentiles ?? {};
  const p   = (key: string) => pct[key] ?? 50;

  const oPct    = p("adj_o");
  const dPct    = p("adj_d");
  const rebO    = p("orb_pct");
  const rebD    = p("drb_pct");
  const toP     = p("to_pct");         // high pct = good ball security
  const oppToP  = p("opp_to_pct");
  const shotSup = p("opp_efg_pct");    // high pct = suppress opponent shots well
  const effShot = p("efg_pct");
  const tempoPct = p("tempo");          // high pct = slow pace (lower tempo is better)

  // Archetype
  let archetype: string;
  if (oPct >= 72 && dPct >= 72)        archetype = "two-way powerhouse";
  else if (oPct >= 72 && dPct < 45)    archetype = "offense-first team";
  else if (dPct >= 72 && oPct < 45)    archetype = "defense-first contender";
  else if (oPct >= 60)                  archetype = "offensively-driven team";
  else if (dPct >= 60)                  archetype = "defense-oriented team";
  else                                  archetype = "balanced squad";

  // Strengths
  const strengths: string[] = [];
  if (effShot >= 70)  strengths.push("efficient shooting");
  if (shotSup >= 70)  strengths.push("excellent shot suppression");
  if (toP >= 70)      strengths.push("disciplined ball security");
  if (oppToP >= 70)   strengths.push("aggressive turnover pressure");
  if (rebD >= 70)     strengths.push("strong defensive rebounding");
  if (rebO >= 70)     strengths.push("dominant offensive rebounding");
  else if ((rebO + rebD) / 2 >= 65) strengths.push("solid rebounding");

  // Tempo sentence
  let tempoCopy = "";
  if (tempoPct <= 28)  tempoCopy = " They push the pace relentlessly.";
  else if (tempoPct >= 72) tempoCopy = " They prefer a methodical, half-court game.";

  // Build narrative
  const strengthText =
    strengths.length === 0  ? "" :
    strengths.length === 1  ? ` with ${strengths[0]}` :
    strengths.length === 2  ? ` with ${strengths[0]} and ${strengths[1]}` :
    ` with ${strengths.slice(0, -1).join(", ")}, and ${strengths.at(-1)}`;

  const narrative = `${team.team_name} profiles as a ${archetype}${strengthText}.${tempoCopy}`;

  // Style tags
  const tags: StyleTag[] = [];
  if (ranked && ranked.march_score >= 80) tags.push({ label: "Deep Run Threat",    color: "amber"  });
  if (oPct >= 78)                          tags.push({ label: "Elite Offense",      color: "blue"   });
  if (dPct >= 78)                          tags.push({ label: "Lock-Down Defense",  color: "green"  });
  if (effShot >= 75)                       tags.push({ label: "Efficient Shooter",  color: "blue"   });
  if (shotSup >= 75)                       tags.push({ label: "Shot Suppressor",    color: "green"  });
  if (toP >= 75)                           tags.push({ label: "Turnover-Free",      color: "purple" });
  if (oppToP >= 75)                        tags.push({ label: "Disruptor",          color: "purple" });
  if ((rebO + rebD) / 2 >= 72)             tags.push({ label: "Board Control",      color: "slate"  });
  if (tempoPct <= 25)                      tags.push({ label: "Up-Tempo",           color: "amber"  });
  if (tempoPct >= 75)                      tags.push({ label: "Grind-It-Out",       color: "slate"  });

  return { narrative, tags };
}

// ─── Percentile bar ───────────────────────────────────────────────────────────

function MetricBar({
  label, shortLabel, description, value, pct, higherBetter, format,
}: {
  label:        string;
  shortLabel:   string;
  description:  string;
  value:        number | null;
  pct:          number | null;
  higherBetter: boolean;
  format:       (v: number) => string;
}) {
  const p    = Math.max(0, Math.min(100, pct ?? 0));
  const good = p >= 67;
  const warn = p <= 33;

  const barColor =
    good ? "bg-green-500/80" :
    warn ? "bg-slate-700"    :
           "bg-blue-500/70";

  const valColor =
    good ? "text-green-400" :
    warn ? "text-slate-500" :
           "text-slate-300";

  const Icon =
    good ? TrendingUp   :
    warn ? TrendingDown :
           Minus;

  const iconColor =
    good ? "text-green-500" :
    warn ? "text-slate-700" :
           "text-slate-600";

  return (
    <div className="group space-y-1.5" title={description}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className={cn("w-3 h-3 shrink-0", iconColor)} />
          <span className="text-xs text-slate-400 truncate">
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{shortLabel}</span>
          </span>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className={cn("text-xs font-mono font-semibold tabular-nums", valColor)}>
            {value != null ? format(value) : "—"}
          </span>
          <span className="text-2xs text-slate-700 w-9 text-right tabular-nums">
            {pct != null ? `${Math.round(p)}th` : ""}
          </span>
        </div>
      </div>
      {/* Track */}
      <div className="relative h-1.5 rounded-full bg-surface-overlay overflow-hidden">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500", barColor)}
          style={{ width: `${Math.max(2, p)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function MetricSection({
  section, metrics, team, pct,
}: {
  section: Section;
  metrics: MetricDef[];
  team:    TeamDetailOut;
  pct:     Record<string, number>;
}) {
  const meta = SECTION_META[section];
  const Icon = meta.icon;

  return (
    <SectionCard
      title={meta.title}
      action={<Icon className={cn("w-4 h-4", meta.color)} />}
    >
      <div className="space-y-4">
        {metrics.map((def) => (
          <MetricBar
            key={def.key}
            label={def.label}
            shortLabel={def.shortLabel}
            description={def.description}
            value={team.metrics[def.key]}
            pct={pct[def.key] ?? null}
            higherBetter={def.higherBetter}
            format={def.format}
          />
        ))}
      </div>
    </SectionCard>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-32" />
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-14" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <div className="flex gap-2 pt-1">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-5 w-20 rounded-full" />)}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-3">
            <div className="flex items-center justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-4" /></div>
            {Array.from({ length: 3 }).map((__, j) => <Skeleton key={j} className="h-7 w-full rounded-lg" />)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function TeamProfileContent() {
  const params       = useParams<{ team_id: string }>();
  const searchParams = useSearchParams();
  const router       = useRouter();

  const teamId = Number(params.team_id);
  const season  = Number(searchParams.get("season")) || 2026;
  const profile = searchParams.get("profile") ?? "balanced";

  const [team, setTeam]       = useState<TeamDetailOut | null>(null);
  const [ranked, setRanked]   = useState<RankedTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.teamById(teamId),
      api.rankings(season, profile),
    ])
      .then(([teamData, rankData]) => {
        setTeam(teamData);
        setRanked(rankData.teams.find((t) => t.team_id === teamId) ?? null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [teamId, season, profile]);

  function backToRankings() {
    router.push(`/team-rankings?season=${season}&profile=${profile}`);
  }

  function goToMatchup() {
    router.push(`/matchup-analyzer?season=${season}&profile=${profile}`);
  }

  if (error) {
    return (
      <div className="space-y-4 animate-fade-in">
        <button onClick={backToRankings} className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Rankings
        </button>
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (loading || !team) return <ProfileSkeleton />;

  const m                    = team.metrics;
  const pct                  = ranked?.metric_percentiles ?? {};
  const { narrative, tags }  = buildProfile(team, ranked);

  // Group metrics by section
  const bySection = METRICS.reduce<Partial<Record<Section, MetricDef[]>>>((acc, def) => {
    (acc[def.section] ??= []).push(def);
    return acc;
  }, {});

  const sectionOrder: Section[] = ["strength", "offense", "defense", "possession", "style"];

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Back ────────────────────────────────────────────────────────────── */}
      <button
        onClick={backToRankings}
        className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Rankings
      </button>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <PageHeader
        title={team.team_name}
        subtitle={`${team.conference ?? "Independent"} · ${season} season`}
        badge={
          team.region
            ? <Badge variant={REGION_VARIANT[team.region] ?? "slate"}>#{team.seed} {team.region}</Badge>
            : undefined
        }
        actions={
          <button
            onClick={goToMatchup}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-card hover:bg-surface-overlay border border-surface-border text-slate-300 hover:text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Swords className="w-3 h-3" /> Matchup Analyzer
          </button>
        }
      />

      {/* ── Key stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label:  "March Rank",
            value:  ranked ? `#${ranked.rank}` : "—",
            sub:    `${profile} profile`,
            amber:  ranked?.rank != null && ranked.rank <= 4,
          },
          {
            label:  "March Score",
            value:  ranked ? ranked.march_score.toFixed(1) : "—",
            sub:    "percentile composite",
            amber:  false,
          },
          {
            label:  "Season Record",
            value:  team.record,
            sub:    team.conference ?? "—",
            amber:  false,
          },
          {
            label:  "Adj. Eff. Margin",
            value:  m.adj_em != null
              ? (m.adj_em > 0 ? `+${m.adj_em.toFixed(1)}` : m.adj_em.toFixed(1))
              : "—",
            sub:    "pts / 100 possessions",
            amber:  false,
          },
        ].map(({ label, value, sub, amber }) => (
          <div
            key={label}
            className={cn(
              "rounded-xl border p-4 space-y-1",
              amber ? "border-amber-800/40 bg-amber-950/20" : "border-surface-border bg-surface-card"
            )}
          >
            <p className="text-2xs text-slate-500 uppercase tracking-wider">{label}</p>
            <p className={cn("text-2xl font-bold font-mono", amber ? "text-amber-400" : "text-white")}>
              {value}
            </p>
            <p className="text-2xs text-slate-500">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Narrative + tags ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0 mt-0.5">
            <BarChart2 className="w-4 h-4 text-brand-light" />
          </div>
          <div className="space-y-1.5">
            <p className="text-2xs text-slate-500 uppercase tracking-widest font-semibold">Team Profile</p>
            <p className="text-sm text-slate-200 leading-relaxed">{narrative}</p>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1 border-t border-surface-border">
            {tags.map((tag) => (
              <Badge key={tag.label} variant={tag.color}>{tag.label}</Badge>
            ))}
          </div>
        )}
      </div>

      {/* ── Metric sections — 2-column grid ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sectionOrder
          .filter((s) => (bySection[s]?.length ?? 0) > 0)
          .map((s) => (
            <MetricSection
              key={s}
              section={s}
              metrics={bySection[s]!}
              team={team}
              pct={pct}
            />
          ))}
      </div>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-surface-border bg-surface-card px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-white">
            How does {team.team_name.split(" ").slice(-1)[0]} match up against the field?
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Use the Matchup Analyzer to run a head-to-head simulation.
          </p>
        </div>
        <button
          onClick={goToMatchup}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors shrink-0"
        >
          <Swords className="w-3.5 h-3.5" /> Run Matchup
        </button>
      </div>

    </div>
  );
}

export default function TeamProfilePage() {
  return <Suspense><TeamProfileContent /></Suspense>;
}
