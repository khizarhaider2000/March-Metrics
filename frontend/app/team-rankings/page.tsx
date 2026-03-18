"use client";

import { useEffect, useState, useMemo, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search, SlidersHorizontal, ArrowUpDown,
  ArrowUp, ArrowDown, ChevronRight, AlertTriangle, TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api, RankedTeam, ProfileOut } from "@/lib/api";
import { ProfileWeightBars } from "@/components/ui/profile-weight-bars";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROFILES   = ["balanced", "offense-heavy", "defense-heavy", "upset-hunter"];
const REGIONS    = ["All", "East", "West", "South", "Midwest"] as const;
const SEED_BANDS = [
  { label: "All seeds", min: 0,  max: 99 },
  { label: "1–4",       min: 1,  max: 4  },
  { label: "5–8",       min: 5,  max: 8  },
  { label: "9–12",      min: 9,  max: 12 },
  { label: "13–16",     min: 13, max: 16 },
] as const;

// ─── Column definitions ────────────────────────────────────────────────────────

type MetricKey =
  // Core
  | "march_score"
  // Efficiency
  | "adj_em" | "adj_o" | "adj_d"
  // Shooting
  | "efg_pct" | "fg2_pct" | "fg3_pct" | "opp_fg3_pct" | "opp_efg_pct"
  // Possession
  | "to_pct" | "ast_to" | "orb_pct" | "drb_pct"
  // Pressure
  | "ft_rate" | "opp_ft_rate"
  // Style
  | "tempo" | "three_p_rate";

interface ColDef {
  key:          MetricKey;
  label:        string;
  tooltip:      string;
  group:        ColGroup;
  higherBetter: boolean | null; // null = neutral (no tier coloring)
  format:       (v: number) => string;
}

type ColGroup = "Score" | "Efficiency" | "Shooting" | "Possession" | "Pressure" | "Style";

const METRIC_COLS: ColDef[] = [
  // ── Score ──────────────────────────────────────────────────────────────────
  {
    key: "march_score", label: "Score", group: "Score", higherBetter: true,
    tooltip: "March Score — composite percentile across all tracked metrics. Higher = stronger tournament team.",
    format: (v) => v.toFixed(1),
  },

  // ── Efficiency ─────────────────────────────────────────────────────────────
  {
    key: "adj_em", label: "AdjEM", group: "Efficiency", higherBetter: true,
    tooltip: "Adjusted efficiency margin (offense minus defense). Best single measure of overall team strength.",
    format: (v) => v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1),
  },
  {
    key: "adj_o", label: "AdjO", group: "Efficiency", higherBetter: true,
    tooltip: "Adjusted offensive efficiency — points scored per 100 possessions (adjusted for opponent). Higher is better.",
    format: (v) => v.toFixed(1),
  },
  {
    key: "adj_d", label: "AdjD", group: "Efficiency", higherBetter: false,
    tooltip: "Adjusted defensive efficiency — points allowed per 100 possessions (adjusted for opponent). Lower is better.",
    format: (v) => v.toFixed(1),
  },

  // ── Shooting ───────────────────────────────────────────────────────────────
  {
    key: "efg_pct", label: "eFG%", group: "Shooting", higherBetter: true,
    tooltip: "Effective field goal % — weights 3-pointers at 1.5× to account for their extra point. Better than raw FG%.",
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: "fg2_pct", label: "FG2%", group: "Shooting", higherBetter: true,
    tooltip: "2-point field goal percentage. Measures efficiency inside the arc.",
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: "fg3_pct", label: "FG3%", group: "Shooting", higherBetter: true,
    tooltip: "3-point shooting percentage. Hot shooting from deep is a major March equalizer.",
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: "opp_fg3_pct", label: "OFG3%", group: "Shooting", higherBetter: false,
    tooltip: "Opponent 3-point percentage allowed. Measures perimeter defense. Lower is better.",
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: "opp_efg_pct", label: "OeFG%", group: "Shooting", higherBetter: false,
    tooltip: "Opponent effective FG% allowed — overall defensive shooting suppression. Lower is better.",
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },

  // ── Possession ─────────────────────────────────────────────────────────────
  {
    key: "to_pct", label: "TO%", group: "Possession", higherBetter: false,
    tooltip: "Turnover rate — turnovers per possession. Lower is better. Teams that protect the ball advance further.",
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: "ast_to", label: "AST/TO", group: "Possession", higherBetter: true,
    tooltip: "Assist-to-turnover ratio. Measures ball security and playmaking. Higher = more controlled offense.",
    format: (v) => v.toFixed(2),
  },
  {
    key: "orb_pct", label: "ORB%", group: "Possession", higherBetter: true,
    tooltip: "Offensive rebounding percentage — share of available offensive boards grabbed. Generates extra possessions.",
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: "drb_pct", label: "DRB%", group: "Possession", higherBetter: true,
    tooltip: "Defensive rebounding percentage — share of available defensive boards grabbed. Prevents opponent second chances.",
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },

  // ── Pressure ───────────────────────────────────────────────────────────────
  {
    key: "ft_rate", label: "FT Rate", group: "Pressure", higherBetter: true,
    tooltip: "Free throw rate — FTAs per field goal attempt. Getting to the line often is a sign of an aggressive offense.",
    format: (v) => v.toFixed(2),
  },
  {
    key: "opp_ft_rate", label: "OFT Rate", group: "Pressure", higherBetter: false,
    tooltip: "Opponent free throw rate — how often the defense sends opponents to the line. Lower = cleaner defense.",
    format: (v) => v.toFixed(2),
  },

  // ── Style ──────────────────────────────────────────────────────────────────
  {
    key: "tempo", label: "Tempo", group: "Style", higherBetter: null,
    tooltip: "Pace of play — estimated possessions per 40 minutes. High tempo can neutralize slow, methodical opponents.",
    format: (v) => v.toFixed(1),
  },
  {
    key: "three_p_rate", label: "3P Rate", group: "Style", higherBetter: null,
    tooltip: "3-point attempt rate — share of shot attempts from 3-point range. High rate = boom-or-bust volatility.",
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
];

// Which metric key is the first column in its group (for group separator lines)
const GROUP_FIRST = new Set<MetricKey>(["march_score", "adj_em", "efg_pct", "to_pct", "ft_rate", "tempo"]);

// Column groups for the header row
const HEADER_GROUPS: { label: string; span: number; color?: string }[] = [
  { label: "",           span: 6  },                           // static info cols
  { label: "Score",      span: 1,  color: "text-brand-light" },
  { label: "Efficiency", span: 3,  color: "text-blue-400"    },
  { label: "Shooting",   span: 5,  color: "text-amber-400"   },
  { label: "Possession", span: 4,  color: "text-green-400"   },
  { label: "Pressure",   span: 2,  color: "text-purple-400"  },
  { label: "Style",      span: 2,  color: "text-slate-400"   },
  { label: "",           span: 1  },                           // arrow col
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REGION_VARIANT: Record<string, "blue" | "green" | "amber" | "purple"> = {
  East: "blue", West: "green", South: "amber", Midwest: "purple",
};

function getMetricValue(team: RankedTeam, key: MetricKey): number | null {
  if (key === "march_score") return team.march_score;
  const v = team.raw_metrics[key];
  return v != null ? v : null;
}

function marchScoreColor(score: number) {
  if (score >= 85) return "text-green-400";
  if (score >= 70) return "text-blue-400";
  if (score >= 50) return "text-slate-300";
  return "text-slate-500";
}

function tier(value: number | null, all: (number | null)[], higherBetter: boolean): "top" | "mid" | "bot" {
  if (value == null) return "mid";
  const valid = all.filter((v): v is number => v != null);
  if (valid.length < 2) return "mid";
  const sorted = [...valid].sort((a, b) => a - b);
  const lo33   = sorted[Math.floor(sorted.length * 0.33)];
  const hi67   = sorted[Math.floor(sorted.length * 0.67)];
  if (higherBetter) {
    if (value >= hi67) return "top";
    if (value <= lo33) return "bot";
  } else {
    if (value <= lo33) return "top";
    if (value >= hi67) return "bot";
  }
  return "mid";
}

function tierCls(t: "top" | "mid" | "bot") {
  if (t === "top") return "text-green-400";
  if (t === "bot") return "text-slate-600";
  return "text-slate-400";
}

type SortKey = "rank" | "seed" | MetricKey;
type SortDir = "asc" | "desc";

// ─── Top-5 summary strip ──────────────────────────────────────────────────────

function TopFiveStrip({ teams }: { teams: RankedTeam[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {teams.slice(0, 5).map((t, i) => (
        <div
          key={t.team_id}
          className={cn(
            "rounded-xl border p-3 space-y-1",
            i === 0 ? "border-amber-800/40 bg-amber-950/20" : "border-surface-border bg-surface-card",
          )}
        >
          <div className="flex items-center justify-between">
            <span className={cn("text-2xs font-bold tabular-nums", i === 0 ? "text-amber-400" : "text-slate-500")}>
              #{i + 1}
            </span>
            <Badge variant={REGION_VARIANT[t.region ?? ""] ?? "slate"} className="text-2xs">
              {t.region}
            </Badge>
          </div>
          <p className={cn("text-xs font-semibold leading-tight truncate", i === 0 ? "text-white" : "text-slate-200")}>
            {t.team_name}
          </p>
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-2xs text-slate-500">Seed {t.seed}</span>
            <span className={cn("text-xs font-bold font-mono", marchScoreColor(t.march_score))}>
              {t.march_score.toFixed(1)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Mismatch strip ───────────────────────────────────────────────────────────

function MismatchStrip({ teams }: { teams: RankedTeam[] }) {
  const total       = teams.length;
  const undervalued = teams.filter((t) => (t.seed ?? 99) >= 6 && t.rank <= Math.ceil(total * 0.38));
  const overvalued  = teams.filter((t) => (t.seed ?? 0) <= 3 && t.rank >= Math.floor(total * 0.62));
  if (undervalued.length === 0 && overvalued.length === 0) return null;

  return (
    <SectionCard
      title="Seed Mismatches"
      description="Teams ranked significantly above or below their tournament seed"
      action={
        <Badge variant="amber">
          <AlertTriangle className="w-2.5 h-2.5 inline mr-1" />
          {undervalued.length + overvalued.length} flagged
        </Badge>
      }
    >
      <div className="space-y-4">
        {undervalued.length > 0 && (
          <div>
            <p className="text-2xs text-green-400 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Undervalued by seed
            </p>
            <div className="flex flex-wrap gap-2">
              {undervalued.map((t) => (
                <span key={t.team_id} className="inline-flex items-center gap-1.5 text-xs bg-green-950/30 border border-green-900/40 text-green-300 rounded-lg px-2 py-1">
                  <span className="font-mono text-2xs text-green-500">#{t.rank}</span>
                  {t.team_name}
                  <span className="text-green-600">·</span>
                  <span className="text-green-500/70">seed {t.seed}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {overvalued.length > 0 && (
          <div>
            <p className="text-2xs text-orange-400 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Overvalued by seed
            </p>
            <div className="flex flex-wrap gap-2">
              {overvalued.map((t) => (
                <span key={t.team_id} className="inline-flex items-center gap-1.5 text-xs bg-orange-950/30 border border-orange-900/40 text-orange-300 rounded-lg px-2 py-1">
                  <span className="font-mono text-2xs text-orange-500">#{t.rank}</span>
                  {t.team_name}
                  <span className="text-orange-600">·</span>
                  <span className="text-orange-500/70">seed {t.seed}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Sort header cell ─────────────────────────────────────────────────────────

function SortTh({
  label, tooltip, sortKey: key, current, dir, onSort, className, groupFirst,
}: {
  label:     string;
  tooltip:   string;
  sortKey:   SortKey;
  current:   SortKey;
  dir:       SortDir;
  onSort:    (k: SortKey) => void;
  className?: string;
  groupFirst?: boolean;
}) {
  const active = current === key;
  return (
    <th
      onClick={() => onSort(key)}
      className={cn(
        "px-3 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap",
        active ? "text-blue-400" : "text-slate-500 hover:text-slate-300",
        groupFirst && "border-l border-slate-800/70",
        className,
      )}
    >
      <Tooltip content={tooltip} side="below">
        <span className="inline-flex items-center gap-1">
          {label}
          {active
            ? dir === "asc"
              ? <ArrowUp className="w-2.5 h-2.5" />
              : <ArrowDown className="w-2.5 h-2.5" />
            : <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />}
        </span>
      </Tooltip>
    </th>
  );
}

// ─── Main page content ────────────────────────────────────────────────────────

function TeamRankingsContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlProfile   = searchParams.get("profile") ?? "balanced";
  const urlSeason    = Number(searchParams.get("season")) || 2026;

  const [profile, setProfile] = useState(urlProfile);
  const season                = urlSeason;

  const [teams, setTeams]   = useState<RankedTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [profilesData, setProfilesData] = useState<ProfileOut[]>([]);

  useEffect(() => {
    api.profiles().then((r) => setProfilesData(r.profiles)).catch(() => {});
  }, []);

  const activeProfileWeights = profilesData.find((p) => p.name === profile)?.weights ?? {};
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const syncingScrollRef = useRef<"top" | "bottom" | null>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(1600);

  // Filters
  const [search, setSearch]     = useState("");
  const [region, setRegion]     = useState<string>("All");
  const [seedBand, setSeedBand] = useState(0);
  const [conf, setConf]         = useState("All");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const conferences = useMemo(() => {
    const set = new Set(teams.map((t) => t.conference).filter(Boolean) as string[]);
    return ["All", ...Array.from(set).sort()];
  }, [teams]);

  // Pre-compute per-column value arrays for tier coloring
  const allValues = useMemo(() => {
    const out: Record<string, (number | null)[]> = {};
    for (const col of METRIC_COLS) {
      out[col.key] = teams.map((t) => getMetricValue(t, col.key));
    }
    return out;
  }, [teams]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.rankings(season, profile)
      .then((data) => setTeams(data.teams))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [profile, season]);

  useEffect(() => {
    const tableEl = tableRef.current;
    if (!tableEl) return;

    const updateWidth = () => setTableScrollWidth(tableEl.scrollWidth);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(tableEl);

    return () => observer.disconnect();
  }, [teams.length, search, region, seedBand, conf, sortKey, sortDir, loading]);

  useEffect(() => {
    const topEl = topScrollRef.current;
    const bottomEl = bottomScrollRef.current;
    if (!topEl || !bottomEl) return;

    const syncFromTop = () => {
      if (syncingScrollRef.current === "bottom") return;
      syncingScrollRef.current = "top";
      bottomEl.scrollLeft = topEl.scrollLeft;
      requestAnimationFrame(() => {
        syncingScrollRef.current = null;
      });
    };

    const syncFromBottom = () => {
      if (syncingScrollRef.current === "top") return;
      syncingScrollRef.current = "bottom";
      topEl.scrollLeft = bottomEl.scrollLeft;
      requestAnimationFrame(() => {
        syncingScrollRef.current = null;
      });
    };

    topEl.addEventListener("scroll", syncFromTop);
    bottomEl.addEventListener("scroll", syncFromBottom);

    return () => {
      topEl.removeEventListener("scroll", syncFromTop);
      bottomEl.removeEventListener("scroll", syncFromBottom);
    };
  }, []);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "rank" || key === "seed" ? "asc" : "desc");
    }
  }

  const filtered = useMemo(() => {
    const band = SEED_BANDS[seedBand];
    let list = teams.filter((t) => {
      if (search.trim() && !t.team_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (region !== "All" && t.region !== region) return false;
      if (seedBand !== 0) {
        const s = t.seed ?? 0;
        if (s < band.min || s > band.max) return false;
      }
      if (conf !== "All" && t.conference !== conf) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      let diff = 0;
      if (sortKey === "rank")       diff = a.rank - b.rank;
      else if (sortKey === "seed")  diff = (a.seed ?? 99) - (b.seed ?? 99);
      else {
        const av = getMetricValue(a, sortKey) ?? -Infinity;
        const bv = getMetricValue(b, sortKey) ?? -Infinity;
        diff = av - bv;
      }
      return sortDir === "asc" ? diff : -diff;
    });
    return list;
  }, [teams, search, region, seedBand, conf, sortKey, sortDir]);

  function handleRowClick(teamId: number) {
    const params = new URLSearchParams({ season: String(season), profile });
    router.push(`/team-rankings/${teamId}?${params}`);
  }

  function changeProfile(p: string) {
    setProfile(p);
    const params = new URLSearchParams(searchParams.toString());
    params.set("profile", p);
    router.replace(`/team-rankings?${params}`, { scroll: false });
  }

  // Total column count for skeleton/empty cells
  const totalCols = 6 + METRIC_COLS.length + 1; // static + metrics + arrow

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Team Rankings"
        subtitle={`All tournament teams ranked by March Score · ${season} season`}
        badge={
          <Badge variant="blue" dot>
            {season} Field · {loading ? "…" : `${teams.length} Teams`}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Profile</span>
            <select
              className="text-xs bg-surface-card border border-surface-border text-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand/50"
              value={profile}
              onChange={(e) => changeProfile(e.target.value)}
            >
              {PROFILES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        }
      />

      {/* ── Active profile weight breakdown ────────────────────────────────── */}
      {Object.keys(activeProfileWeights).length > 0 && (
        <div className="rounded-xl border border-surface-border bg-surface-card px-4 py-3">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
            {profile} — stat weights
          </p>
          <ProfileWeightBars weights={activeProfileWeights} />
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {error} — is the backend running?
        </div>
      )}

      {/* ── Top-5 strip ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-surface-border bg-surface-card p-3 space-y-2">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      ) : teams.length > 0 ? (
        <TopFiveStrip teams={teams} />
      ) : null}

      {/* ── Mismatches ──────────────────────────────────────────────────────── */}
      {!loading && teams.length > 0 && <MismatchStrip teams={teams} />}

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative min-w-48 max-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search teams…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-card border border-surface-border text-slate-300 placeholder-slate-600 text-sm rounded-lg pl-9 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand/50"
          />
        </div>

        {/* Region pills */}
        <div className="flex items-center gap-1">
          {REGIONS.map((r) => (
            <button
              key={r}
              onClick={() => setRegion(r)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                r === region
                  ? "bg-surface-overlay border border-surface-border text-slate-200"
                  : "text-slate-500 hover:text-slate-300 hover:bg-surface-overlay",
              )}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Seed band pills */}
        <div className="flex items-center gap-1">
          {SEED_BANDS.map((b, i) => (
            <button
              key={b.label}
              onClick={() => setSeedBand(i)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                i === seedBand
                  ? "bg-surface-overlay border border-surface-border text-slate-200"
                  : "text-slate-500 hover:text-slate-300 hover:bg-surface-overlay",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Conference dropdown */}
        {conferences.length > 2 && (
          <select
            value={conf}
            onChange={(e) => setConf(e.target.value)}
            className="text-xs bg-surface-card border border-surface-border text-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand/50"
          >
            {conferences.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}

        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {loading ? "Loading…" : `${filtered.length} of ${teams.length} teams`}
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <SectionCard padded={false}>
        <div
          ref={topScrollRef}
          className="overflow-x-auto border-b border-surface-border"
          aria-label="Horizontal scroll for team rankings table"
        >
          <div style={{ width: `${tableScrollWidth}px`, height: "14px" }} />
        </div>
        <div ref={bottomScrollRef} className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <table
            ref={tableRef}
            className="w-full border-collapse"
            style={{ minWidth: "1600px" }}
          >
            <thead>

              {/* ── Group header row ──────────────────────────────────────── */}
              <tr className="border-b border-slate-800/60">
                {HEADER_GROUPS.map((g, i) => (
                  <th
                    key={i}
                    colSpan={g.span}
                    className={cn(
                      "py-1.5 text-left",
                      g.label && i > 0 ? "border-l border-slate-800/70" : "",
                    )}
                  >
                    {g.label && (
                      <span className={cn(
                        "px-3 text-2xs font-semibold uppercase tracking-widest",
                        g.color ?? "text-slate-600",
                      )}>
                        {g.label}
                      </span>
                    )}
                  </th>
                ))}
              </tr>

              {/* ── Sort header row ───────────────────────────────────────── */}
              <tr className="border-b border-surface-border">
                {/* Static info columns */}
                <SortTh
                  label="#" tooltip="March rank — sorted by March Score."
                  sortKey="rank" current={sortKey} dir={sortDir} onSort={handleSort}
                  className="pl-5 w-10"
                />
                <th className="px-3 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-slate-500 min-w-[180px]">
                  Team
                </th>
                <SortTh
                  label="Seed" tooltip="NCAA tournament seed (1 = highest)."
                  sortKey="seed" current={sortKey} dir={sortDir} onSort={handleSort}
                  className="w-14"
                />
                <th className="px-3 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-slate-500 w-20">
                  Region
                </th>
                <th className="px-3 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-slate-500 w-20 hidden lg:table-cell">
                  Conf.
                </th>
                <th className="px-3 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-slate-500 w-16 hidden sm:table-cell">
                  Record
                </th>

                {/* Metric columns */}
                {METRIC_COLS.map((col) => (
                  <SortTh
                    key={col.key}
                    label={col.label}
                    tooltip={col.tooltip}
                    sortKey={col.key}
                    current={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    groupFirst={GROUP_FIRST.has(col.key)}
                  />
                ))}

                <th className="px-3 py-2.5 w-8" />
              </tr>
            </thead>

            <tbody>
              {loading ? (
                Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} className="border-b border-surface-border last:border-0">
                    {Array.from({ length: totalCols }).map((__, j) => (
                      <td key={j} className="px-3 py-3">
                        <Skeleton className={cn("h-3.5", j === 1 ? "w-32" : j < 3 ? "w-10" : "w-10")} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} className="px-5 py-12 text-center text-sm text-slate-500">
                    No teams match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((team) => (
                  <tr
                    key={team.team_id}
                    onClick={() => handleRowClick(team.team_id)}
                    className="border-b border-surface-border last:border-0 hover:bg-surface-overlay/50 transition-colors cursor-pointer group"
                  >
                    {/* Rank */}
                    <td className="pl-5 pr-3 py-3 text-sm text-slate-500 font-mono tabular-nums w-10">
                      {team.rank}
                    </td>

                    {/* Team name */}
                    <td className="px-3 py-3 min-w-[180px]">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-surface-overlay border border-surface-border flex items-center justify-center shrink-0">
                          <span className="text-2xs font-bold text-slate-400">{team.team_name[0]}</span>
                        </div>
                        <span className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                          {team.team_name}
                        </span>
                      </div>
                    </td>

                    {/* Seed */}
                    <td className="px-3 py-3 text-sm text-slate-400 font-mono w-14">
                      #{team.seed}
                    </td>

                    {/* Region */}
                    <td className="px-3 py-3 w-20">
                      <Badge variant={REGION_VARIANT[team.region ?? ""] ?? "slate"}>
                        {team.region}
                      </Badge>
                    </td>

                    {/* Conference */}
                    <td className="px-3 py-3 text-xs text-slate-500 w-20 hidden lg:table-cell">
                      {team.conference}
                    </td>

                    {/* Record */}
                    <td className="px-3 py-3 text-xs text-slate-500 font-mono w-16 hidden sm:table-cell">
                      {team.record}
                    </td>

                    {/* Metric cells */}
                    {METRIC_COLS.map((col) => {
                      const v = getMetricValue(team, col.key);
                      const t = col.higherBetter == null
                        ? "mid"
                        : tier(v, allValues[col.key], col.higherBetter);
                      const cls = col.key === "march_score"
                        ? cn("font-bold", marchScoreColor(team.march_score))
                        : tierCls(t);
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "px-3 py-3 text-xs font-mono tabular-nums text-right",
                            cls,
                            GROUP_FIRST.has(col.key) && "border-l border-slate-800/40",
                          )}
                        >
                          {v == null ? <span className="text-slate-800">—</span> : col.format(v)}
                        </td>
                      );
                    })}

                    {/* Row arrow */}
                    <td className="pr-4 py-3 w-8">
                      <ChevronRight className="w-3.5 h-3.5 text-slate-700 group-hover:text-slate-400 transition-colors" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <p className="text-xs text-slate-600 text-center">
        March Score is a percentile-weighted composite · hover any column header for an explanation · {season} data
      </p>
    </div>
  );
}

export default function TeamRankingsPage() {
  return (
    <div className="p-4 sm:p-6 max-w-[1800px] mx-auto">
      <Suspense>
        <TeamRankingsContent />
      </Suspense>
    </div>
  );
}
