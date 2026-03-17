"""
app/schemas/matchup.py

Output data structures for the matchup engine.
All plain dataclasses — no DB or FastAPI dependency.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from app.schemas.scoring import ScoredTeam


# ---------------------------------------------------------------------------
# Category edge
# ---------------------------------------------------------------------------

@dataclass
class CategoryEdge:
    """
    Comparison result for one analytical category (e.g. "Offense").

    team_a_score / team_b_score
        Average direction-corrected percentile across the category's metrics
        in a two-team head-to-head pool.  Range [0, 100]; 100 = perfect.

    gap
        Absolute difference: |team_a_score - team_b_score|.
        0 = dead even, 100 = maximum possible advantage.

    edge_strength thresholds
        toss-up  : gap < 8
        slight   : 8 ≤ gap < 22
        clear    : 22 ≤ gap < 42
        strong   : gap ≥ 42
    """
    category: str          # internal key, e.g. "offense"
    label: str             # display label, e.g. "Offensive Efficiency"
    metrics: list[str]     # which TeamMetrics fields were averaged

    team_a_id: int
    team_a_name: str
    team_a_score: float

    team_b_id: int
    team_b_name: str
    team_b_score: float

    gap: float
    edge_strength: str     # "toss-up" | "slight" | "clear" | "strong"
    winner_id: int | None  # None when gap == 0 (exact tie)
    winner_name: str | None


# ---------------------------------------------------------------------------
# Full matchup result
# ---------------------------------------------------------------------------

@dataclass
class MatchupResult:
    """
    Complete output of analyze_matchup().

    winner / loser
        ScoredTeam objects from the two-team head-to-head scoring pool.
        winner.march_score > loser.march_score (or team_a wins a tie).

    score_gap
        winner.march_score − loser.march_score  (always ≥ 0).

    confidence
        Human label for how decisive the overall edge is:
          "toss-up"         score_gap < 8
          "slight favorite" 8 ≤ gap < 18
          "moderate favorite" 18 ≤ gap < 35
          "heavy favorite"  gap ≥ 35

    category_edges
        One CategoryEdge per analytical category, ordered by gap descending
        so the most decisive categories appear first.

    top_reasons
        Short noun-phrases for the 1–3 categories where the winner
        holds the largest advantage.  Used directly in the explanation.

    explanation
        Single plain-English paragraph ready for display in the UI.
    """
    profile_name: str

    winner: ScoredTeam
    loser: ScoredTeam
    score_gap: float
    confidence: str

    category_edges: list[CategoryEdge] = field(default_factory=list)
    top_reasons: list[str] = field(default_factory=list)
    explanation: str = ""
