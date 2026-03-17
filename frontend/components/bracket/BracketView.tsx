"use client";

import { useMemo } from "react";
import type { BracketResponse, BracketGameOut } from "@/lib/api";
import { BracketMatchupNode } from "./BracketMatchupNode";

// ─── Layout constants ─────────────────────────────────────────────────────────
// Approximate game node height — content determines real height but this
// drives the slot centering calculation.
const GAME_H   = 56;   // px
const SLOT_R64 = 68;   // px — slot height for Round of 64 (= GAME_H + 12 margin)
const GAME_W   = 168;  // px — game node column width
const CONN_W   = 12;   // px — connector strip between columns
const COL_GAP  = CONN_W; // gap equals connector width so connector fills gap exactly
const REGION_GAP = 24; // px — vertical gap between the two stacked regions

// Slot height multipliers per regional round (R64 = 1x, R32 = 2x, …)
const SLOT_MULT: Record<string, number> = {
  "Round of 64":   1,
  "Round of 32":   2,
  "Sweet Sixteen": 4,
  "Elite Eight":   8,
};

const ROUND_SHORT: Record<string, string> = {
  "Round of 64":   "R64",
  "Round of 32":   "R32",
  "Sweet Sixteen": "Sweet 16",
  "Elite Eight":   "Elite 8",
  "Final Four":    "Final Four",
  "Championship":  "Championship",
};

const REGION_COLOR: Record<string, string> = {
  East:    "text-blue-500",
  West:    "text-green-500",
  South:   "text-amber-500",
  Midwest: "text-purple-500",
};

// Each region occupies 8 × SLOT_R64 pixels of height
const REGION_H = 8 * SLOT_R64;       // 544 px
const TOTAL_H  = REGION_H * 2 + REGION_GAP; // 1112 px

// Vertical centers (Y from top) for Final Four and Championship nodes
const FF_TOP_Y  = REGION_H / 2;                           // 272
const FF_BOT_Y  = REGION_H + REGION_GAP + REGION_H / 2;   // 840
const CHAMP_Y   = Math.round((FF_TOP_Y + FF_BOT_Y) / 2);  // 556

// Round column order for each half
const LEFT_ROUNDS  = ["Round of 64", "Round of 32", "Sweet Sixteen", "Elite Eight"] as const;
const RIGHT_ROUNDS = ["Elite Eight", "Sweet Sixteen", "Round of 32", "Round of 64"] as const;

// Region assignments: left half = East + West, right half = South + Midwest
const LEFT_REGIONS  = ["East",  "West"]    as const;
const RIGHT_REGIONS = ["South", "Midwest"] as const;

const BORDER_COLOR = "#1e293b"; // slate-800

// ─── Connector line ───────────────────────────────────────────────────────────

function Connector({
  isTopOfPair,
  side,
}: {
  isTopOfPair: boolean;
  side: "left" | "right";
}) {
  const base: React.CSSProperties = {
    position: "absolute",
    width: CONN_W,
    [side]: -CONN_W,
    [`border${side === "right" ? "Right" : "Left"}`]: `1px solid ${BORDER_COLOR}`,
  };

  const style: React.CSSProperties = isTopOfPair
    ? { ...base, top: "50%", bottom: 0,    borderBottom: `1px solid ${BORDER_COLOR}` }
    : { ...base, top: 0,     bottom: "50%", borderTop: `1px solid ${BORDER_COLOR}` };

  return <div style={style} />;
}

// ─── Single game slot ─────────────────────────────────────────────────────────

function GameSlot({
  game,
  slotH,
  isTopOfPair,
  showConnector,
  connSide,
  onGameClick,
}: {
  game:          BracketGameOut | null;
  slotH:         number;
  isTopOfPair:   boolean;
  showConnector: boolean;
  connSide:      "left" | "right";
  onGameClick:   (g: BracketGameOut) => void;
}) {
  return (
    <div style={{ height: slotH, position: "relative" }}>
      {game && (
        <div style={{ position: "absolute", top: (slotH - GAME_H) / 2, width: "100%" }}>
          <BracketMatchupNode game={game} onClick={() => onGameClick(game)} />
        </div>
      )}
      {showConnector && game && (
        <Connector isTopOfPair={isTopOfPair} side={connSide} />
      )}
    </div>
  );
}

// ─── One round-column for a single region ────────────────────────────────────

function RegionRoundColumn({
  games,
  roundName,
  showConnector,
  connSide,
  onGameClick,
}: {
  games:         BracketGameOut[];
  roundName:     string;
  showConnector: boolean;
  connSide:      "left" | "right";
  onGameClick:   (g: BracketGameOut) => void;
}) {
  const mult  = SLOT_MULT[roundName] ?? 1;
  const slotH = SLOT_R64 * mult;

  return (
    <>
      {games.map((game, i) => (
        <GameSlot
          key={game.game_id}
          game={game}
          slotH={slotH}
          isTopOfPair={i % 2 === 0}
          showConnector={showConnector}
          connSide={connSide}
          onGameClick={onGameClick}
        />
      ))}
    </>
  );
}

// ─── Half bracket (two regions stacked, all regional rounds) ─────────────────

function HalfBracket({
  regions,
  bracket,
  roundOrder,
  connSide,
  onGameClick,
}: {
  regions:     readonly [string, string];
  bracket:     BracketResponse;
  roundOrder:  readonly string[];
  connSide:    "left" | "right";
  onGameClick: (g: BracketGameOut) => void;
}) {
  // Pre-sort games per region per round
  const byRegionRound = useMemo(() => {
    const out: Record<string, Record<string, BracketGameOut[]>> = {};
    for (const region of regions) {
      out[region] = {};
      for (const round of bracket.rounds) {
        out[region][round.round_name] = round.games
          .filter((g) => g.region === region)
          .sort((a, b) => a.slot - b.slot);
      }
    }
    return out;
  }, [bracket, regions]);

  return (
    <div style={{ display: "flex", gap: COL_GAP, flexShrink: 0 }}>
      {roundOrder.map((roundName, colIdx) => {
        // E8 is the innermost round — it connects to FF via CenterSection, not via column connector
        const showConn = roundName !== "Elite Eight";
        // Region labels: show on outermost column (R64)
        const isOutermost = roundName === "Round of 64";

        return (
          <div key={roundName} style={{ width: GAME_W, flexShrink: 0 }}>
            {/* Round label header */}
            <div
              style={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}
              className="text-2xs font-medium text-slate-600 uppercase tracking-wider"
            >
              {ROUND_SHORT[roundName]}
            </div>

            {/* Two stacked regions */}
            {regions.map((region, rIdx) => (
              <div key={region}>
                {/* Region label — only on outermost column */}
                <div style={{ height: 16, display: "flex", alignItems: "center" }}>
                  {isOutermost && (
                    <span className={`text-2xs font-semibold ${REGION_COLOR[region] ?? "text-slate-500"}`}>
                      {region}
                    </span>
                  )}
                </div>

                <RegionRoundColumn
                  games={byRegionRound[region]?.[roundName] ?? []}
                  roundName={roundName}
                  showConnector={showConn}
                  connSide={connSide}
                  onGameClick={onGameClick}
                />

                {/* Spacer between the two regions */}
                {rIdx === 0 && <div style={{ height: REGION_GAP + 16 }} />}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Center section — Final Four + Championship ───────────────────────────────

function CenterSection({
  bracket,
  onGameClick,
}: {
  bracket:     BracketResponse;
  onGameClick: (g: BracketGameOut) => void;
}) {
  const ffGames = useMemo(() => {
    const r = bracket.rounds.find((r) => r.round_name === "Final Four");
    return (r?.games ?? []).slice().sort((a, b) => a.slot - b.slot);
  }, [bracket]);

  const champGame = useMemo(() => {
    const r = bracket.rounds.find((r) => r.round_name === "Championship");
    return r?.games?.[0] ?? null;
  }, [bracket]);

  const ffTop  = ffGames[0] ?? null;
  const ffBot  = ffGames[1] ?? null;
  const CENTER_W = 196;
  const NODE_W   = CENTER_W - 20;
  const nodeLeft = (CENTER_W - NODE_W) / 2;
  const midX     = CENTER_W / 2;

  // Label top offset (same as HalfBracket: 28px round label + 16px region label)
  const LABEL_H = 28 + 16;

  return (
    <div style={{ width: CENTER_W, flexShrink: 0 }}>
      {/* Column label */}
      <div
        style={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}
        className="text-2xs font-medium text-amber-600/80 uppercase tracking-wider"
      >
        Final Four
      </div>

      {/* Absolute-positioned bracket nodes + lines */}
      <div style={{ position: "relative", height: TOTAL_H + 32 }}>

        {/* ── Connector lines ──────────────────────────────────────────────── */}

        {/* Horizontal lines connecting E8 (left) to FF top */}
        {ffTop && (
          <div style={{ position: "absolute", top: FF_TOP_Y - 0.5, left: 0, width: nodeLeft, height: 1, background: BORDER_COLOR }} />
        )}
        {/* Horizontal lines connecting E8 (right) to FF top */}
        {ffTop && (
          <div style={{ position: "absolute", top: FF_TOP_Y - 0.5, right: 0, width: nodeLeft, height: 1, background: BORDER_COLOR }} />
        )}

        {/* Horizontal lines for FF bottom */}
        {ffBot && (
          <div style={{ position: "absolute", top: FF_BOT_Y - 0.5, left: 0, width: nodeLeft, height: 1, background: BORDER_COLOR }} />
        )}
        {ffBot && (
          <div style={{ position: "absolute", top: FF_BOT_Y - 0.5, right: 0, width: nodeLeft, height: 1, background: BORDER_COLOR }} />
        )}

        {/* Vertical line: FF top → Championship */}
        {ffTop && champGame && (
          <div style={{
            position: "absolute",
            left: midX - 0.5,
            top: FF_TOP_Y,
            height: CHAMP_Y - FF_TOP_Y,
            width: 1,
            background: BORDER_COLOR,
          }} />
        )}

        {/* Vertical line: Championship → FF bottom */}
        {champGame && ffBot && (
          <div style={{
            position: "absolute",
            left: midX - 0.5,
            top: CHAMP_Y + GAME_H,
            height: FF_BOT_Y - (CHAMP_Y + GAME_H),
            width: 1,
            background: BORDER_COLOR,
          }} />
        )}

        {/* ── Game nodes ───────────────────────────────────────────────────── */}

        {ffTop && (
          <div style={{ position: "absolute", top: FF_TOP_Y - GAME_H / 2, left: nodeLeft, width: NODE_W }}>
            <BracketMatchupNode game={ffTop} onClick={() => onGameClick(ffTop)} />
          </div>
        )}

        {champGame && (
          <div style={{ position: "absolute", top: CHAMP_Y - GAME_H / 2, left: nodeLeft, width: NODE_W }}>
            <BracketMatchupNode game={champGame} onClick={() => onGameClick(champGame)} isChampionship />
          </div>
        )}

        {ffBot && (
          <div style={{ position: "absolute", top: FF_BOT_Y - GAME_H / 2, left: nodeLeft, width: NODE_W }}>
            <BracketMatchupNode game={ffBot} onClick={() => onGameClick(ffBot)} />
          </div>
        )}

        {/* Championship label */}
        {champGame && (
          <div style={{ position: "absolute", top: CHAMP_Y - GAME_H / 2 - 18, left: nodeLeft, width: NODE_W }}>
            <p className="text-2xs text-amber-500/70 font-semibold uppercase tracking-widest text-center">
              Championship
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Exported BracketView ────────────────────────────────────────────────────

export interface BracketViewProps {
  bracket:     BracketResponse;
  onGameClick: (game: BracketGameOut) => void;
}

export function BracketView({ bracket, onGameClick }: BracketViewProps) {
  return (
    <div className="overflow-x-auto pb-4 rounded-xl">
      <div
        className="inline-flex items-start min-w-max"
        style={{ gap: COL_GAP }}
      >
        {/* Left half: East (top) + West (bottom), rounds L→R */}
        <HalfBracket
          regions={LEFT_REGIONS}
          bracket={bracket}
          roundOrder={LEFT_ROUNDS}
          connSide="right"
          onGameClick={onGameClick}
        />

        {/* Center: Final Four + Championship */}
        <CenterSection bracket={bracket} onGameClick={onGameClick} />

        {/* Right half: South (top) + Midwest (bottom), rounds R→L (E8 leftmost) */}
        <HalfBracket
          regions={RIGHT_REGIONS}
          bracket={bracket}
          roundOrder={RIGHT_ROUNDS}
          connSide="left"
          onGameClick={onGameClick}
        />
      </div>
    </div>
  );
}
