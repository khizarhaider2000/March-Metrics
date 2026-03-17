"""
app/api/schemas.py

Pydantic response models for all API endpoints.

These are the shapes the frontend receives. They are intentionally separate
from the internal dataclasses in app/schemas/ — those drive computation,
these drive serialization and OpenAPI documentation.

Conventions:
  - Optional fields default to None so responses never omit keys.
  - `record` is always a computed "W-L" string.
  - All float fields are rounded at the service layer; no rounding here.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, computed_field


# ---------------------------------------------------------------------------
# Shared base types
# ---------------------------------------------------------------------------

class MetricsDict(BaseModel):
    """All twelve advanced metrics. Any may be None if data is missing."""
    adj_em:      Optional[float] = None
    adj_o:       Optional[float] = None
    adj_d:       Optional[float] = None
    efg_pct:     Optional[float] = None
    opp_efg_pct: Optional[float] = None
    to_pct:      Optional[float] = None
    opp_to_pct:  Optional[float] = None
    orb_pct:     Optional[float] = None
    drb_pct:     Optional[float] = None
    ft_rate:     Optional[float] = None
    tempo:       Optional[float] = None
    sos:         Optional[float] = None


class TeamBase(BaseModel):
    """Common team identity fields shared across several responses."""
    team_id:      int
    team_name:    str
    seed:         Optional[int]   = None
    region:       Optional[str]   = None
    conference:   Optional[str]   = None
    record_wins:  int
    record_losses: int

    @computed_field
    @property
    def record(self) -> str:
        return f"{self.record_wins}-{self.record_losses}"


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status:  str
    service: str
    version: str


# ---------------------------------------------------------------------------
# GET /profiles
# ---------------------------------------------------------------------------

class ProfileOut(BaseModel):
    name:        str
    description: Optional[str]  = None
    is_custom:   bool
    weights:     dict[str, float]


class ProfilesResponse(BaseModel):
    count:    int
    profiles: list[ProfileOut]


# ---------------------------------------------------------------------------
# GET /teams
# ---------------------------------------------------------------------------

class TeamOut(TeamBase):
    season: int


class TeamsResponse(BaseModel):
    season: int
    count:  int
    teams:  list[TeamOut]


# ---------------------------------------------------------------------------
# GET /teams/{team_id}
# ---------------------------------------------------------------------------

class TeamDetailOut(TeamBase):
    season:  int
    metrics: MetricsDict


# ---------------------------------------------------------------------------
# GET /rankings
# ---------------------------------------------------------------------------

class RankedTeamOut(TeamBase):
    season:             int
    rank:               int
    march_score:        float
    metric_percentiles: dict[str, float]
    raw_metrics:        dict[str, Optional[float]]


class RankingsResponse(BaseModel):
    profile: str
    season:  int
    count:   int
    teams:   list[RankedTeamOut]


# ---------------------------------------------------------------------------
# GET /matchup
# ---------------------------------------------------------------------------

class MatchupTeamOut(TeamBase):
    """Team info enriched with its head-to-head March Score."""
    march_score: float


class CategoryEdgeOut(BaseModel):
    category:     str
    label:        str
    team_a_score: float
    team_b_score: float
    gap:          float
    edge_strength: str
    winner_name:  Optional[str] = None


class MatchupResponse(BaseModel):
    profile:        str
    winner:         MatchupTeamOut
    loser:          MatchupTeamOut
    score_gap:      float
    confidence:     str
    top_reasons:    list[str]
    explanation:    str
    category_edges: list[CategoryEdgeOut]


# ---------------------------------------------------------------------------
# GET /bracket
# ---------------------------------------------------------------------------

class BracketTeamOut(TeamBase):
    pass  # TeamBase has everything needed for bracket display


class BracketGameOut(BaseModel):
    game_id:             int
    round_num:           int
    round_name:          str
    region:              Optional[str]           = None
    slot:                int
    team_a:              Optional[BracketTeamOut] = None
    team_b:              Optional[BracketTeamOut] = None
    winner:              Optional[BracketTeamOut] = None
    loser:               Optional[BracketTeamOut] = None
    winner_march_score:  Optional[float]          = None
    loser_march_score:   Optional[float]          = None
    score_gap:           Optional[float]          = None
    confidence:          Optional[str]            = None
    top_reasons:         list[str]               = []
    explanation:         str                     = ""
    category_edges:      list[dict[str, Any]]    = []


class BracketRoundOut(BaseModel):
    round_num:  int
    round_name: str
    games:      list[BracketGameOut]


class BracketResponse(BaseModel):
    profile:       str
    season:        int
    bracket_size:  int
    champion:      Optional[BracketTeamOut] = None
    rounds:        list[BracketRoundOut]
