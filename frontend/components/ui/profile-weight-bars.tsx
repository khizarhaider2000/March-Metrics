// Renders a compact weight breakdown for a weight profile.
// Used inside tooltips and profile cards.

const WEIGHT_LABELS: Record<string, string> = {
  adj_em:      "Adj EM",
  adj_o:       "Adj O",
  adj_d:       "Adj D",
  efg_pct:     "eFG%",
  opp_efg_pct: "Opp eFG%",
  to_pct:      "TO%",
  opp_to_pct:  "Opp TO%",
  orb_pct:     "ORB%",
  drb_pct:     "DRB%",
  ft_rate:     "FT Rate",
  opp_ft_rate: "Opp FT",
  tempo:       "Tempo",
  sos:         "SOS",
  fg2_pct:     "FG2%",
  fg3_pct:     "FG3%",
  opp_fg3_pct: "OFG3%",
  ast_to:      "AST/TO",
  three_p_rate:"3P Rate",
};

interface ProfileWeightBarsProps {
  weights: Record<string, number>;
  /** Max rows to display. Default: show all non-zero weights. */
  maxRows?: number;
  accentClass?: string;
}

export function ProfileWeightBars({
  weights,
  maxRows,
  accentClass = "bg-brand/70",
}: ProfileWeightBarsProps) {
  // Sort by weight descending, filter zero-weight metrics
  const sorted = Object.entries(weights)
    .filter(([, w]) => w > 0)
    .sort(([, a], [, b]) => b - a);

  const rows = maxRows ? sorted.slice(0, maxRows) : sorted;
  const maxW = sorted[0]?.[1] ?? 1;

  // Normalize to percentage for display
  const total = sorted.reduce((s, [, w]) => s + w, 0);

  return (
    <div className="space-y-1.5">
      {rows.map(([key, w]) => {
        const pct = total > 0 ? Math.round((w / total) * 100) : 0;
        const barW = Math.round((w / maxW) * 100);
        const label = WEIGHT_LABELS[key] ?? key;
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="w-16 text-right text-[10px] text-slate-400 shrink-0">{label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${accentClass}`}
                style={{ width: `${barW}%` }}
              />
            </div>
            <span className="w-7 text-[10px] text-slate-500 tabular-nums shrink-0">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}
