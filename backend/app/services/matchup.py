"""
app/services/matchup.py

March Metrics Matchup Engine
==============================

Compares two teams head-to-head and produces a structured MatchupResult
including category edges, top reasons, and a plain-English explanation.

Design
------
All normalization is delegated to the scoring engine's ``score_single_matchup``,
which scores Team A and Team B against *each other only* (two-team pool).
Because the pool is exactly two teams, the percentile ranks are symmetric:
if Team A has percentile 75 on a metric, Team B has percentile 25.

This module only consumes those already-computed, direction-corrected
percentiles — it never re-implements stat logic.

Five analytical categories group the twelve metrics:

  efficiency  → adj_em, sos
  offense     → adj_o, efg_pct, ft_rate
  defense     → adj_d, opp_efg_pct
  ball_security → to_pct, opp_to_pct
  rebounding  → orb_pct, drb_pct

tempo is a secondary metric intentionally excluded from categories
(it influences the offense bucket's character but doesn't cleanly
belong to a single "edge" narrative).  It is included in the
raw scoring but not highlighted as a standalone category reason.

Public API
----------
    analyze_matchup(team_a, team_b, profile) → MatchupResult
"""

from __future__ import annotations

from typing import Union

from app.schemas.matchup import CategoryEdge, MatchupResult
from app.schemas.scoring import ScoredTeam, TeamInput
from app.services.profiles import WeightDict
from app.services.scoring import score_single_matchup


# ---------------------------------------------------------------------------
# Category definitions
# ---------------------------------------------------------------------------

# Each entry: (internal_key, display_label, [metric_fields])
CATEGORIES: list[tuple[str, str, list[str]]] = [
    ("efficiency",    "Overall Efficiency",  ["adj_em", "sos"]),
    ("offense",       "Offensive Output",    ["adj_o", "efg_pct", "ft_rate", "ast_pct", "two_pt_pct", "three_pt_rate"]),
    ("defense",       "Defensive Strength",  ["adj_d", "opp_efg_pct", "opp_ft_rate", "opp_two_pt_pct", "steal_pct", "block_pct"]),
    ("ball_security", "Ball Security",        ["to_pct", "opp_to_pct"]),
    ("rebounding",    "Rebounding",           ["orb_pct", "drb_pct"]),
]

# ---------------------------------------------------------------------------
# Edge strength thresholds (percentile gap in a 2-team head-to-head pool)
# ---------------------------------------------------------------------------

def _edge_strength(gap: float) -> str:
    if gap < 8:
        return "toss-up"
    if gap < 22:
        return "slight"
    if gap < 42:
        return "clear"
    return "strong"


def _confidence_label(score_gap: float) -> str:
    if score_gap < 8:
        return "toss-up"
    if score_gap < 18:
        return "slight favorite"
    if score_gap < 35:
        return "moderate favorite"
    return "heavy favorite"


# ---------------------------------------------------------------------------
# Category edge computation
# ---------------------------------------------------------------------------

def _build_category_edge(
    category_key: str,
    label: str,
    metrics: list[str],
    scored_a: ScoredTeam,
    scored_b: ScoredTeam,
) -> CategoryEdge:
    """
    Compute the average percentile for each team across *metrics*,
    then determine who has the edge and how large it is.
    """
    def avg_pct(team: ScoredTeam) -> float:
        values = [team.metric_percentiles.get(m, 50.0) for m in metrics]
        return sum(values) / len(values)

    score_a = round(avg_pct(scored_a), 2)
    score_b = round(avg_pct(scored_b), 2)
    gap = round(abs(score_a - score_b), 2)

    if gap == 0:
        winner_id, winner_name = None, None
    elif score_a > score_b:
        winner_id, winner_name = scored_a.team_id, scored_a.team_name
    else:
        winner_id, winner_name = scored_b.team_id, scored_b.team_name

    return CategoryEdge(
        category=category_key,
        label=label,
        metrics=metrics,
        team_a_id=scored_a.team_id,
        team_a_name=scored_a.team_name,
        team_a_score=score_a,
        team_b_id=scored_b.team_id,
        team_b_name=scored_b.team_name,
        team_b_score=score_b,
        gap=gap,
        edge_strength=_edge_strength(gap),
        winner_id=winner_id,
        winner_name=winner_name,
    )


# ---------------------------------------------------------------------------
# Plain-English explanation generator
# ---------------------------------------------------------------------------

# Phrases keyed by (category, edge_strength) → phrase fragment.
# The phrase always describes the *winner's* advantage.
_PHRASES: dict[str, dict[str, list[str]]] = {
    "efficiency": {
        "slight": [
            "a modest efficiency edge",
            "a slight overall margin advantage",
        ],
        "clear": [
            "better overall efficiency",
            "a clear adjusted efficiency margin",
        ],
        "strong": [
            "elite overall efficiency",
            "a dominant efficiency margin",
        ],
    },
    "offense": {
        "slight": [
            "slightly better offensive output",
            "a small shooting advantage",
        ],
        "clear": [
            "superior offensive firepower",
            "more efficient scoring",
        ],
        "strong": [
            "elite offensive production",
            "a huge scoring efficiency edge",
        ],
    },
    "defense": {
        "slight": [
            "slightly tighter defense",
            "a small shot-suppression edge",
        ],
        "clear": [
            "stronger defense",
            "better shot suppression",
        ],
        "strong": [
            "stifling defense",
            "dominant shot suppression",
        ],
    },
    "ball_security": {
        "slight": [
            "marginally better ball security",
            "a slight turnover edge",
        ],
        "clear": [
            "better ball security",
            "a clear turnover advantage",
        ],
        "strong": [
            "elite ball security",
            "overwhelming turnover dominance",
        ],
    },
    "rebounding": {
        "slight": [
            "a slim rebounding edge",
            "marginally better glass work",
        ],
        "clear": [
            "better rebounding",
            "controlling the glass",
        ],
        "strong": [
            "glass dominance",
            "overwhelming rebounding superiority",
        ],
    },
}


def _pick_phrase(category: str, edge_strength: str, index: int = 0) -> str:
    """
    Return a descriptive phrase for *category* at *edge_strength*.
    *index* cycles through alternates to vary language when multiple
    categories share the same strength tier.
    """
    options = _PHRASES.get(category, {}).get(edge_strength, [])
    if not options:
        return f"an edge in {category.replace('_', ' ')}"
    return options[index % len(options)]


def _build_explanation(
    winner: ScoredTeam,
    loser: ScoredTeam,
    confidence: str,
    top_edges: list[CategoryEdge],
    score_gap: float,
) -> str:
    """
    Assemble a single natural-language paragraph explaining the pick.

    Examples:
      "Houston wins this matchup as a heavy favorite — dominant shot
       suppression, better ball security, and a clear efficiency margin
       over Duke."

      "Auburn edges out Charleston in a toss-up — a slight offensive
       output advantage and marginally better rebounding, though this
       one could go either way."
    """
    winner_name = winner.team_name
    loser_name  = loser.team_name

    # Collect reason phrases from the top edges where winner has the advantage
    reason_phrases: list[str] = []
    for i, edge in enumerate(top_edges):
        if edge.winner_id == winner.team_id and edge.edge_strength != "toss-up":
            phrase = _pick_phrase(edge.category, edge.edge_strength, index=i)
            reason_phrases.append(phrase)

    # Opening clause varies by confidence
    if confidence == "toss-up":
        opener = f"{winner_name} edges out {loser_name} in what is essentially a toss-up"
    elif confidence == "slight favorite":
        opener = f"{winner_name} is a slight favorite over {loser_name}"
    elif confidence == "moderate favorite":
        opener = f"{winner_name} wins this matchup as a moderate favorite over {loser_name}"
    else:
        opener = f"{winner_name} wins this matchup as a heavy favorite over {loser_name}"

    # Build reason clause
    if not reason_phrases:
        reason_clause = f"holding a narrow {score_gap:.1f}-point March Score edge"
    elif len(reason_phrases) == 1:
        reason_clause = reason_phrases[0]
    elif len(reason_phrases) == 2:
        reason_clause = f"{reason_phrases[0]} and {reason_phrases[1]}"
    else:
        reason_clause = (
            ", ".join(reason_phrases[:-1]) + f", and {reason_phrases[-1]}"
        )

    # Caveat for close games
    caveat = ""
    if confidence == "toss-up":
        caveat = " — though this one could go either way"
    elif confidence == "slight favorite" and score_gap < 12:
        caveat = " — don't sleep on the underdog"

    return f"{opener} — {reason_clause}{caveat}."


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_matchup(
    team_a: TeamInput,
    team_b: TeamInput,
    profile: Union[str, WeightDict],
    round_num: int | None = None,
) -> MatchupResult:
    """
    Compare *team_a* and *team_b* head-to-head using *profile*.

    Parameters
    ----------
    team_a, team_b
        ``TeamInput`` objects with metric fields populated.
    profile
        Built-in profile name (str) or a custom ``WeightDict``.
    round_num
        Tournament round (0=First Four … 6=Championship).  When supplied,
        activates round-specific weight adjustments, matchup delta scoring,
        and seed compression.  Pass None for the standalone Matchup Analyzer.

    Returns
    -------
    MatchupResult
        Fully populated with scores, category edges, reasons, and explanation.
    """
    # Resolve profile name for reporting
    profile_name = profile if isinstance(profile, str) else "custom"

    # ── Step 1: Head-to-head scoring ───────────────────────────────────────
    scored_a, scored_b = score_single_matchup(team_a, team_b, profile, round_num)

    # Determine overall winner (higher march_score wins; team_a wins a tie)
    if scored_a.march_score >= scored_b.march_score:
        winner, loser = scored_a, scored_b
    else:
        winner, loser = scored_b, scored_a

    score_gap = round(winner.march_score - loser.march_score, 2)
    confidence = _confidence_label(score_gap)

    # ── Step 2: Category edges ─────────────────────────────────────────────
    edges: list[CategoryEdge] = [
        _build_category_edge(key, label, metrics, scored_a, scored_b)
        for key, label, metrics in CATEGORIES
    ]

    # Sort by gap descending — most decisive categories first
    edges.sort(key=lambda e: e.gap, reverse=True)

    # ── Step 3: Top reasons — categories where winner has the biggest lead ─
    winner_edges = [e for e in edges if e.winner_id == winner.team_id]
    top_edges = winner_edges[:3]  # at most 3 reasons

    top_reasons: list[str] = [
        _pick_phrase(e.category, e.edge_strength, index=i)
        for i, e in enumerate(top_edges)
        if e.edge_strength != "toss-up"
    ]

    # ── Step 4: Plain-English explanation ─────────────────────────────────
    explanation = _build_explanation(winner, loser, confidence, top_edges, score_gap)

    return MatchupResult(
        profile_name=profile_name,
        winner=winner,
        loser=loser,
        score_gap=score_gap,
        confidence=confidence,
        category_edges=edges,
        top_reasons=top_reasons,
        explanation=explanation,
    )
