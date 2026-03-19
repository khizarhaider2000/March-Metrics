"""
app/schemas/scoring.py

Pydantic models for scoring engine input/output.
These are plain data containers — no DB dependency.
"""

from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class TeamInput:
    """
    Flat representation of a team + its metrics fed into the scoring engine.
    Decoupled from SQLAlchemy so the engine can be called without a DB session
    (e.g. in tests or demo scripts).
    """
    team_id: int
    team_name: str
    seed: int | None
    region: str | None
    conference: str | None
    season: int
    record_wins: int
    record_losses: int

    # Raw metric values — None means missing/unavailable
    adj_em: float | None = None
    adj_o: float | None = None
    adj_d: float | None = None
    efg_pct: float | None = None
    opp_efg_pct: float | None = None
    to_pct: float | None = None
    opp_to_pct: float | None = None
    orb_pct: float | None = None
    drb_pct: float | None = None
    ft_rate: float | None = None
    tempo: float | None = None
    sos: float | None = None
    # Extended metrics
    opp_ft_rate:       float | None = None
    ast_pct:           float | None = None
    three_pt_rate:     float | None = None
    opp_three_pt_rate: float | None = None
    two_pt_pct:        float | None = None
    opp_two_pt_pct:    float | None = None
    steal_pct:         float | None = None
    block_pct:         float | None = None


@dataclass
class ScoredTeam:
    """
    Output record for a single team after scoring.

    Fields:
        rank              – 1-based rank within the scored pool (1 = best)
        march_score       – final weighted score in [0, 100]
        metric_percentiles – per-metric percentile after direction correction,
                             in [0, 100] (100 = best in pool for that metric)
        raw_metrics       – original un-normalized metric values
    """
    rank: int
    team_id: int
    team_name: str
    seed: int | None
    region: str | None
    conference: str | None
    season: int
    record_wins: int
    record_losses: int
    march_score: float
    metric_percentiles: dict[str, float] = field(default_factory=dict)
    raw_metrics: dict[str, float | None] = field(default_factory=dict)

    @property
    def record(self) -> str:
        return f"{self.record_wins}-{self.record_losses}"


@dataclass
class RankingsResult:
    """
    Complete output of compute_march_scores().

    Attributes:
        profile_name  – which weight profile was used
        season        – the season this pool belongs to
        teams         – list of ScoredTeam, sorted by march_score descending
    """
    profile_name: str
    season: int
    teams: list[ScoredTeam] = field(default_factory=list)

    def top(self, n: int) -> list[ScoredTeam]:
        """Return the top-n teams."""
        return self.teams[:n]

    def get_team(self, team_id: int) -> ScoredTeam | None:
        """Look up a single team by id."""
        return next((t for t in self.teams if t.team_id == team_id), None)
