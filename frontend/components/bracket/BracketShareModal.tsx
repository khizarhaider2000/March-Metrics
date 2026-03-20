"use client";

import { useRef, useState, useCallback } from "react";
import { X, Download, Loader2, Trophy, AlertTriangle } from "lucide-react";
import type { BracketResponse, BracketGameOut } from "@/lib/api";
import { BracketView } from "./BracketView";

// Bracket natural dimensions (matches BracketView layout constants)
const BRACKET_W = 1636;
const APPROX_BRACKET_H = 1172;

// Scale applied to the bracket section inside the share card
const SCALE = 1.25;
const SCALED_W = Math.round(BRACKET_W * SCALE);
const SCALED_H = Math.round(APPROX_BRACKET_H * SCALE);

const CARD_PADDING = 32;
const CARD_W = SCALED_W + CARD_PADDING * 2;

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
        pixelRatio: 3,
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
      <div
        className="flex flex-col max-h-[95vh] bg-surface-card border border-surface-border rounded-2xl overflow-hidden shadow-2xl"
        style={{ width: `min(97vw, ${CARD_W + 40}px)` }}
      >

        {/* Modal toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">Share Bracket</h2>
            <p className="text-2xs text-slate-500 mt-0.5">Preview your bracket — save as a high-res PNG to share</p>
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
              className="flex items-center justify-between"
              style={{
                padding: "24px 32px",
                background: "linear-gradient(135deg, #111827 0%, #0f1e33 100%)",
                borderBottom: "1px solid #1e3a5f",
              }}
            >
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#3b82f6" }}>
                  March Madness Tool
                </p>
                <p style={{ fontSize: 28, fontWeight: 800, color: "#ffffff", marginTop: 4 }}>
                  {season} NCAA Tournament Bracket
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#64748b" }}>
                  Analysis Profile
                </p>
                <p style={{ fontSize: 18, fontWeight: 700, color: "#3b82f6", marginTop: 4 }}>
                  {profileLabel}
                </p>
              </div>
            </div>

            {/* Champion + stats row */}
            <div
              style={{
                padding: "20px 32px",
                display: "flex",
                alignItems: "center",
                gap: 32,
                background: "rgba(120,53,15,0.08)",
                borderBottom: "1px solid #1e293b",
              }}
            >
              {/* Champion */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: "rgba(120,53,15,0.40)",
                  border: "1px solid rgba(146,64,14,0.40)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Trophy style={{ width: 24, height: 24, color: "#fbbf24" }} />
                </div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,158,11,0.85)" }}>
                    Champion
                  </p>
                  {champion ? (
                    <>
                      <p style={{ fontSize: 20, fontWeight: 800, color: "#ffffff", marginTop: 2 }}>{champion.team_name}</p>
                      <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>#{champion.seed} · {champion.region} Region</p>
                    </>
                  ) : (
                    <p style={{ fontSize: 14, color: "#475569", fontStyle: "italic", marginTop: 2 }}>Not yet crowned</p>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: 1, height: 56, background: "#1e293b", flexShrink: 0 }} />

              {/* Stats */}
              {stats && (
                <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
                  <div>
                    <p style={{ fontSize: 28, fontWeight: 800, fontFamily: "monospace", color: "#ffffff" }}>
                      {stats.pickedGames}<span style={{ fontSize: 14, color: "#334155" }}>/{stats.totalGames}</span>
                    </p>
                    <p style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>games picked</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 28, fontWeight: 800, fontFamily: "monospace", color: stats.upsets > 0 ? "#fb923c" : "#e2e8f0" }}>
                      {stats.upsets}
                    </p>
                    <p style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>upsets picked</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 28, fontWeight: 800, fontFamily: "monospace", color: "#ffffff" }}>
                      {stats.avgGap.toFixed(1)}
                    </p>
                    <p style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>avg margin</p>
                  </div>

                  {stats.biggestUpset && (
                    <>
                      <div style={{ width: 1, height: 56, background: "#1e293b", flexShrink: 0 }} />
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <AlertTriangle style={{ width: 16, height: 16, marginTop: 3, flexShrink: 0, color: "#fb923c" }} />
                        <div>
                          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#fb923c" }}>
                            Biggest Upset
                          </p>
                          <p style={{ fontSize: 15, fontWeight: 700, color: "#ffffff", marginTop: 3 }}>
                            #{stats.biggestUpset.winner?.seed} {stats.biggestUpset.winner?.team_name}
                          </p>
                          <p style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                            over #{stats.biggestUpset.loser?.seed} {stats.biggestUpset.loser?.team_name} · {stats.biggestUpset.round_name}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Full bracket — scaled up for clarity */}
            <div style={{ padding: CARD_PADDING }}>
              {/* Container sized to the scaled dimensions so the card wraps correctly */}
              <div style={{ width: SCALED_W, height: SCALED_H, overflow: "hidden" }}>
                {/* Apply the scale transform — transform-origin: top left so it grows right/down */}
                <div style={{ transform: `scale(${SCALE})`, transformOrigin: "top left", width: BRACKET_W }}>
                  <BracketView
                    bracket={bracket}
                    onGameClick={() => {}}
                    noScroll
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "10px 32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#080f1a",
                borderTop: "1px solid #0f1f35",
              }}
            >
              <p style={{ fontSize: 11, color: "#334155" }}>Generated with March Madness Tool</p>
              <p style={{ fontSize: 11, fontFamily: "monospace", color: "#1e3a5f" }}>
                {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
