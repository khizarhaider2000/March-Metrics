"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FlaskConical, AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api, AccuracyResponse, AccuracyProfileOut, AccuracyRoundOut } from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROFILE_LABELS: Record<string, string> = {
  "balanced":      "Balanced",
  "offense-heavy": "Offense-Heavy",
  "defense-heavy": "Defense-Heavy",
  "upset-hunter":  "Upset Hunter",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function accuracyVariant(pct: number): "green" | "amber" | "red" | "slate" {
  if (pct >= 65) return "green";
  if (pct >= 50) return "amber";
  if (pct > 0)   return "red";
  return "slate";
}

function AccuracyBar({ pct }: { pct: number }) {
  return (
    <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1.5">
      <div
        className={cn(
          "h-1.5 rounded-full transition-all duration-500",
          pct >= 65 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : pct > 0 ? "bg-red-500" : "bg-slate-700"
        )}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

// ─── Round breakdown (collapsible rows) ───────────────────────────────────────

function RoundRows({ rounds }: { rounds: AccuracyRoundOut[] }) {
  if (rounds.length === 0) return null;
  return (
    <div className="mt-3 space-y-1 border-t border-slate-800 pt-3">
      {rounds.map((r) => (
        <div key={r.round_num} className="flex items-center justify-between text-xs">
          <span className="text-slate-500 w-28 shrink-0">{r.round_name}</span>
          <span className="text-slate-400 font-mono tabular-nums">
            {r.correct_picks}/{r.evaluated_picks}
          </span>
          <span
            className={cn(
              "font-mono tabular-nums w-14 text-right",
              r.accuracy_pct >= 65 ? "text-green-400" :
              r.accuracy_pct >= 50 ? "text-amber-400" : "text-red-400"
            )}
          >
            {r.accuracy_pct.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Profile card ─────────────────────────────────────────────────────────────

function ProfileCard({ p, showRounds }: { p: AccuracyProfileOut; showRounds: boolean }) {
  const label = PROFILE_LABELS[p.profile] ?? p.profile;
  const hasData = p.evaluated_picks > 0;

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-white">{label}</span>
        {hasData ? (
          <Badge variant={accuracyVariant(p.accuracy_pct)}>
            {p.accuracy_pct.toFixed(1)}%
          </Badge>
        ) : (
          <Badge variant="slate">No data</Badge>
        )}
      </div>

      {hasData ? (
        <>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
            <span>
              <span className="text-white font-mono">{p.correct_picks}</span>
              <span className="text-slate-600"> / </span>
              <span className="font-mono">{p.evaluated_picks}</span>
              <span className="text-slate-500"> picks correct</span>
            </span>
          </div>
          <AccuracyBar pct={p.accuracy_pct} />
          {showRounds && <RoundRows rounds={p.rounds} />}
        </>
      ) : (
        <p className="text-xs text-slate-500 italic">
          No completed games to evaluate yet.
        </p>
      )}
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function ModelAccuracyContent() {
  const searchParams = useSearchParams();
  const season = parseInt(searchParams.get("season") ?? "2026", 10);

  const [data, setData]       = useState<AccuracyResponse | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRounds, setShowRounds] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.bracketAccuracy(season)
      .then(setData)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [season]);

  const partial = data && data.evaluated_games < 63;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Model Accuracy"
        subtitle={`How each profile's bracket predictions compared to real ${season} tournament results`}
        badge={<Badge variant="purple" dot>Analytics</Badge>}
        actions={
          data && data.evaluated_games > 0 ? (
            <button
              onClick={() => setShowRounds((v) => !v)}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors px-3 py-1.5 rounded-lg border border-surface-border hover:border-slate-600"
            >
              {showRounds ? "Hide" : "Show"} round breakdown
            </button>
          ) : null
        }
      />

      {/* Partial results notice */}
      {partial && (
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/10 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-slate-400">
            <span className="text-amber-300 font-semibold">Tournament in progress — </span>
            accuracy is based on{" "}
            <span className="text-white font-mono">{data.evaluated_games}</span> completed games only.
            Results update as you add more entries to{" "}
            <code className="text-slate-300 bg-slate-800 px-1 rounded text-2xs">
              backend/app/data/actual_brackets/{season}.json
            </code>
          </p>
        </div>
      )}

      {loading && <LoadingSkeleton />}

      {error && !loading && (
        <SectionCard>
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <FlaskConical className="w-8 h-8 text-slate-600" />
            <p className="text-sm font-medium text-slate-300">No results available</p>
            <p className="text-xs text-slate-500 max-w-sm">
              {error.includes("actual results file") ? (
                <>
                  Create{" "}
                  <code className="text-slate-300 bg-slate-800 px-1 rounded">
                    backend/app/data/actual_brackets/{season}.json
                  </code>{" "}
                  and add completed game entries to track accuracy.
                </>
              ) : (
                error
              )}
            </p>
          </div>
        </SectionCard>
      )}

      {data && !loading && (
        <>
          {data.evaluated_games === 0 ? (
            <SectionCard>
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <FlaskConical className="w-8 h-8 text-slate-600" />
                <p className="text-sm font-medium text-slate-300">No completed games recorded yet</p>
                <p className="text-xs text-slate-500 max-w-sm">
                  Add completed game results to{" "}
                  <code className="text-slate-300 bg-slate-800 px-1 rounded">
                    backend/app/data/actual_brackets/{season}.json
                  </code>{" "}
                  to start tracking how well each model predicts the tournament.
                </p>
              </div>
            </SectionCard>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.profiles.map((p) => (
                <ProfileCard key={p.profile} p={p} showRounds={showRounds} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ModelAccuracyPage() {
  return (
    <Suspense>
      <ModelAccuracyContent />
    </Suspense>
  );
}
