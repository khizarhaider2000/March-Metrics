"use client";

import { useRef, useState, useCallback } from "react";
import { X, Download, Loader2, Trophy, AlertTriangle } from "lucide-react";
import type { BracketResponse, BracketGameOut } from "@/lib/api";
import { BracketView } from "./BracketView";
import { cn } from "@/lib/utils";

// Full bracket content width (4 cols × 168px + 3 gaps × 12px) × 2 halves + center 196px + 2 gaps
const BRACKET_W = 1636;
const CARD_PADDING = 24;
const CARD_W = BRACKET_W + CARD_PADDING * 2;

type BracketTeam = BracketGameOut["team_a"];

interface ShareStats {
  pickedGames: number;
  totalGames: number;
  upsets: number;
  avgGap: number;
  biggestUpset: BracketGameOut | null;
}

interface BracketShareModalProps {
  bracket:  BracketResponse;
  champion: BracketTeam;
  stats:    ShareStats | null;
  profile:  string;
  season:   number;
  onClose:  () => void;
}

export function BracketShareModal({
  bracket,
  champion,
  stats,
  profile,
  season,
  onClose,
}: BracketShareModalProps) {
  const shareCardRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!shareCardRef.current) return;
    setDownloading(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(shareCardRef.current, {
        cacheBust: true,
        backgroundColor: "#0c1526",
        pixelRatio: 2,
      });
      const link = document.createElement("a");
      link.download = `march-madness-${season}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Failed to export bracket:", e);
    } finally {
      setDownloading(false);
    }
  }, [season]);

  const profileLabel = profile
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col w-[min(97vw,1720px)] max-h-[95vh] bg-surface-card border border-surface-border rounded-2xl overflow-hidden shadow-2xl">

        {/* Modal toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">Share Bracket</h2>
            <p className="text-2xs text-slate-500 mt-0.5">Preview your bracket — save as a PNG to share</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {downloading
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Download className="w-3 h-3" />}
              {downloading ? "Saving…" : "Save as PNG"}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-white rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable preview area */}
        <div className="overflow-auto flex-1 p-4 bg-slate-950/60">

          {/* ── Share card — this exact div is captured as the PNG ── */}
          <div
            ref={shareCardRef}
            style={{ width: CARD_W, minWidth: CARD_W, backgroundColor: "#0c1526" }}
            className="rounded-xl overflow-hidden"
          >

            {/* Header bar */}
            <div
              className="px-6 py-5 flex items-center justify-between"
              style={{ background: "linear-gradient(135deg, #111827 0%, #0f1e33 100%)", borderBottom: "1px solid #1e3a5f" }}
            >
              <div>
                <p className="text-2xs font-bold uppercase tracking-widest" style={{ color: "#3b82f6" }}>
                  March Madness Tool
                </p>
                <p className="text-2xl font-bold text-white mt-1">
                  {season} NCAA Tournament Bracket
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xs uppercase tracking-widest font-semibold" style={{ color: "#64748b" }}>
                  Analysis Profile
                </p>
                <p className="text-base font-bold mt-1" style={{ color: "#3b82f6" }}>
                  {profileLabel}
                </p>
              </div>
            </div>

            {/* Champion + stats row */}
            <div
              className="px-6 py-4 flex items-center gap-8"
              style={{ background: "rgba(120,53,15,0.08)", borderBottom: "1px solid #1e293b" }}
            >
              {/* Champion */}
              <div className="flex items-center gap-3 shrink-0">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(120,53,15,0.40)", border: "1px solid rgba(146,64,14,0.40)" }}
                >
                  <Trophy className="w-6 h-6" style={{ color: "#fbbf24" }} />
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-widest font-bold" style={{ color: "rgba(245,158,11,0.8)" }}>
                    {champion ? "Champion" : "Champion"}
                  </p>
                  {champion ? (
                    <>
                      <p className="text-lg font-bold text-white mt-0.5">{champion.team_name}</p>
                      <p className="text-xs" style={{ color: "#94a3b8" }}>
                        #{champion.seed} · {champion.region} Region
                      </p>
                    </>
                  ) : (
                    <p className="text-sm italic mt-0.5" style={{ color: "#475569" }}>Not yet crowned</p>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="h-14 w-px shrink-0" style={{ background: "#1e293b" }} />

              {/* Stats */}
              {stats && (
                <div className="flex items-center gap-10">
                  <div>
                    <p className="text-2xl font-bold font-mono text-white">
                      {stats.pickedGames}
                      <span className="text-sm" style={{ color: "#334155" }}>/{stats.totalGames}</span>
                    </p>
                    <p className="text-xs" style={{ color: "#64748b" }}>games picked</p>
                  </div>
                  <div>
                    <p
                      className="text-2xl font-bold font-mono"
                      style={{ color: stats.upsets > 0 ? "#fb923c" : "#e2e8f0" }}
                    >
                      {stats.upsets}
                    </p>
                    <p className="text-xs" style={{ color: "#64748b" }}>upsets picked</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-mono text-white">{stats.avgGap.toFixed(1)}</p>
                    <p className="text-xs" style={{ color: "#64748b" }}>avg margin</p>
                  </div>

                  {stats.biggestUpset && (
                    <>
                      <div className="h-14 w-px shrink-0" style={{ background: "#1e293b" }} />
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#fb923c" }} />
                        <div>
                          <p className="text-2xs uppercase tracking-wider font-bold" style={{ color: "#fb923c" }}>
                            Biggest Upset
                          </p>
                          <p className="text-sm font-semibold text-white mt-0.5">
                            #{stats.biggestUpset.winner?.seed} {stats.biggestUpset.winner?.team_name}
                          </p>
                          <p className="text-xs" style={{ color: "#64748b" }}>
                            over #{stats.biggestUpset.loser?.seed} {stats.biggestUpset.loser?.team_name} · {stats.biggestUpset.round_name}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Full bracket — no scroll, renders at native size */}
            <div style={{ padding: CARD_PADDING }}>
              <BracketView
                bracket={bracket}
                onGameClick={() => {}}
                noScroll
              />
            </div>

            {/* Footer */}
            <div
              className="px-6 py-3 flex items-center justify-between"
              style={{ background: "#080f1a", borderTop: "1px solid #0f1f35" }}
            >
              <p className="text-2xs" style={{ color: "#334155" }}>
                Generated with March Madness Tool
              </p>
              <p className="text-2xs font-mono" style={{ color: "#1e3a5f" }}>
                {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
