"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import {
  BarChart2, Swords, Trophy, ArrowRight,
  ShieldCheck, Flame, TrendingUp, Shuffle,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { SectionCard } from "@/components/ui/section-card";

// ─── Constants ────────────────────────────────────────────────────────────────

const SEASONS = [2026, 2025, 2024];

const PROFILES = [
  {
    value: "balanced",
    label: "Balanced",
    icon: BarChart2,
    color: "text-blue-400",
    bg: "bg-blue-950/40 border-blue-900/40",
    description: "Equal weight across offense, defense, rebounding, ball security, and efficiency. Best all-around starting point.",
  },
  {
    value: "offense-heavy",
    label: "Offense-Heavy",
    icon: Flame,
    color: "text-orange-400",
    bg: "bg-orange-950/40 border-orange-900/40",
    description: "Prioritizes adjusted offensive efficiency and shooting. Favors teams that can fill the bucket in March.",
  },
  {
    value: "defense-heavy",
    label: "Defense-Heavy",
    icon: ShieldCheck,
    color: "text-green-400",
    bg: "bg-green-950/40 border-green-900/40",
    description: "Leans on adjusted defensive efficiency and opponent shooting. Defense wins championships — model that belief.",
  },
  {
    value: "upset-hunter",
    label: "Upset Hunter",
    icon: Shuffle,
    color: "text-violet-400",
    bg: "bg-violet-950/40 border-violet-900/40",
    description: "Boosts tempo, strength of schedule, and turnover pressure — metrics that correlate with bracket-busting upsets.",
  },
] as const;

type ProfileValue = typeof PROFILES[number]["value"];

const FEATURES = [
  {
    title: "Team Rankings",
    description: "All 64 teams ranked by March Score. Filter by region, sort by any metric.",
    href: "/team-rankings",
    icon: BarChart2,
    color: "text-blue-400",
    bg: "bg-blue-950/50 border-blue-900/50",
    cta: "Explore Rankings",
  },
  {
    title: "Matchup Analyzer",
    description: "Head-to-head simulations between any two teams with a plain-English breakdown.",
    href: "/matchup-analyzer",
    icon: Swords,
    color: "text-violet-400",
    bg: "bg-violet-950/50 border-violet-900/50",
    cta: "Analyze a Matchup",
  },
  {
    title: "Bracket Builder",
    description: "Auto-fill all 63 games from your weight profile, or override picks manually.",
    href: "/bracket-builder",
    icon: Trophy,
    color: "text-amber-400",
    bg: "bg-amber-950/40 border-amber-900/40",
    cta: "Build Your Bracket",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Choose a season & profile",
    body: "Select the tournament year and how much each metric matters to you.",
  },
  {
    step: "02",
    title: "Review team rankings",
    body: "See every team's March Score — a percentile-normalized composite built from 12 advanced metrics.",
  },
  {
    step: "03",
    title: "Simulate any matchup",
    body: "The engine scores both teams in a two-team pool so the edge is precise, not relative to the full field.",
  },
  {
    step: "04",
    title: "Auto-fill your bracket",
    body: "Run all 63 games at once. Every pick comes with a score gap, confidence rating, and explanation.",
  },
];

// ─── Inner page (needs useSearchParams, must be inside Suspense) ──────────────

function HomeContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const season  = Number(searchParams.get("season"))  || SEASONS[0];
  const profile = (searchParams.get("profile") as ProfileValue) || "balanced";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`/?${params.toString()}`, { scroll: false });
  }

  const activeProfile = PROFILES.find((p) => p.value === profile) ?? PROFILES[0];

  // Build deep-link hrefs that carry the current season/profile
  function featureHref(base: string) {
    return `${base}?season=${season}&profile=${profile}`;
  }

  return (
    <div className="space-y-10 animate-fade-in">

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="space-y-6 pt-2">
        <Badge variant="blue" dot>NCAA Tournament · {season}</Badge>

        <div className="space-y-3 max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight text-white leading-tight">
            Smarter brackets,{" "}
            <span className="text-brand-light">built on data.</span>
          </h1>
          <p className="text-slate-400 text-base leading-relaxed">
            March Metrics turns advanced analytics into bracket decisions.
            Pick a weight profile that matches your strategy, rank every team on
            what matters to you, and simulate the full tournament in one click.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={featureHref("/bracket-builder")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Trophy className="w-4 h-4" />
            Build Your Bracket
          </Link>
          <Link
            href={featureHref("/team-rankings")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-surface-card hover:bg-surface-overlay text-slate-200 text-sm font-medium rounded-lg border border-surface-border transition-colors"
          >
            <BarChart2 className="w-4 h-4" />
            Explore Rankings
          </Link>
        </div>
      </div>

      {/* ── Controls ─────────────────────────────────────────────────────────── */}
      <SectionCard
        title="Your Settings"
        description="These selections carry through to Rankings, Matchup, and Bracket pages."
      >
        <div className="flex flex-wrap items-start gap-8">

          {/* Season */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Season</label>
            <div className="flex items-center gap-2">
              {SEASONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setParam("season", String(s))}
                  className={
                    s === season
                      ? "px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand/20 border border-brand/40 text-brand-light"
                      : "px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 border border-surface-border hover:text-slate-300 hover:bg-surface-overlay transition-colors"
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Profile */}
          <div className="space-y-2 flex-1 min-w-0">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Weight Profile</label>
            <div className="flex flex-wrap gap-2">
              {PROFILES.map((p) => {
                const Icon = p.icon;
                const active = p.value === profile;
                return (
                  <button
                    key={p.value}
                    onClick={() => setParam("profile", p.value)}
                    className={
                      active
                        ? `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${p.bg} ${p.color}`
                        : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 border border-surface-border hover:text-slate-300 hover:bg-surface-overlay transition-colors"
                    }
                  >
                    <Icon className="w-3 h-3" />
                    {p.label}
                  </button>
                );
              })}
            </div>
            {/* Active profile description */}
            <p className="text-xs text-slate-500 leading-relaxed pt-1 max-w-lg">
              {activeProfile.description}
            </p>
          </div>

        </div>
      </SectionCard>

      {/* ── Quick nav cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <Link
              key={f.href}
              href={featureHref(f.href)}
              className="group rounded-xl border bg-surface-card p-5 card-hover flex flex-col gap-4"
            >
              <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${f.bg}`}>
                <Icon className={`w-4 h-4 ${f.color}`} />
              </div>
              <div className="flex-1 space-y-1.5">
                <h3 className="text-sm font-semibold text-white group-hover:text-brand-light transition-colors">
                  {f.title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">{f.description}</p>
              </div>
              <div className={`flex items-center gap-1 text-xs font-medium ${f.color}`}>
                {f.cta}
                <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Weight profiles explained ─────────────────────────────────────────── */}
      <SectionCard
        title="Weight Profiles"
        description="Each profile re-ranks teams by shifting how much each metric category counts."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PROFILES.map((p) => {
            const Icon = p.icon;
            const active = p.value === profile;
            return (
              <button
                key={p.value}
                onClick={() => setParam("profile", p.value)}
                className={`text-left rounded-xl border p-4 space-y-2 transition-colors ${
                  active ? p.bg : "border-surface-border bg-surface-card hover:bg-surface-overlay"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${active ? p.color : "text-slate-500"}`} />
                  <span className={`text-sm font-semibold ${active ? "text-white" : "text-slate-400"}`}>
                    {p.label}
                  </span>
                  {active && (
                    <span className="ml-auto text-2xs font-medium text-brand-light border border-brand/30 rounded px-1.5 py-0.5">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{p.description}</p>
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <SectionCard title="How it works" description="Four steps from raw data to a completed bracket.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {HOW_IT_WORKS.map(({ step, title, body }) => (
            <div key={step} className="space-y-2">
              <span className="text-2xs font-bold text-brand-light tracking-widest uppercase">
                Step {step}
              </span>
              <h4 className="text-sm font-semibold text-white">{title}</h4>
              <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-6 pt-5 border-t border-surface-border flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            Ready? Your current profile is{" "}
            <span className={`font-semibold ${activeProfile.color}`}>{activeProfile.label}</span>
            {" "}for the <span className="text-slate-300 font-medium">{season}</span> season.
          </p>
          <Link
            href={featureHref("/bracket-builder")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors"
          >
            Auto-fill my bracket
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </SectionCard>

    </div>
  );
}

// ─── Page export (Suspense boundary for useSearchParams) ──────────────────────

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
