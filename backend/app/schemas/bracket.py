"""
app/schemas/bracket.py

Output data structures for the bracket engine.
All plain dataclasses — no DB or FastAPI dependency.

to_dict() on BracketResult uses dataclasses.asdict() for deep JSON conversion,
making it safe to pass directly to FastAPI response models or json.dumps().
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Lightweight team display record
# ---------------------------------------------------------------------------

@dataclass
class TeamInfo:
    """
    Minimal team record used inside bracket output.
    Avoids carrying full metric data through every game node.
    """
    team_id: int
    team_name: str
    seed: int | None
    region: str | None
    conference: str | None
    record_wins: int
    record_losses: int

    @property
    def record(self) -> str:
        return f"{self.record_wins}-{self.record_losses}"


# ---------------------------------------------------------------------------
# Single game result
# ---------------------------------------------------------------------------

@dataclass
class BracketGame:
    """
    One matchup slot in the bracket.

    Positional fields (game_id, round_num, region, slot) let the frontend
    place the game in the correct bracket cell without extra logic.

    slot
        1-indexed position within this round+region combination.
        Slot 1 = top of the bracket, slot N = bottom.

    category_edges
        Simplified list of dicts (one per analytical category) derived from
        MatchupResult.category_edges.  Stored as plain dicts so
        dataclasses.asdict() produces a clean nested JSON structure.
    """
    game_id: int
    round_num: int
    round_name: str
    region: str | None        # None for Final Four and Championship
    slot: int

    team_a: TeamInfo | None   # None for games seeded from future rounds
    team_b: TeamInfo | None

    # Populated after the matchup engine runs
    winner: TeamInfo | None
    loser: TeamInfo | None
    winner_march_score: float | None
    loser_march_score: float | None
    score_gap: float | None
    confidence: str | None    # "toss-up" | "slight favorite" | … | "heavy favorite"
    top_reasons: list[str]    = field(default_factory=list)
    explanation: str          = ""
    category_edges: list[dict] = field(default_factory=list)


# ---------------------------------------------------------------------------
# One complete round
# ---------------------------------------------------------------------------

@dataclass
class BracketRound:
    """
    All games in a single round, potentially spanning multiple regions.

    For rounds 1–4 the games are ordered:
        East games (slot 1…N), West games, South games, Midwest games.
    For round 5 (Final Four) and round 6 (Championship) there is no region.
    """
    round_num: int
    round_name: str
    games: list[BracketGame] = field(default_factory=list)

    @property
    def winners(self) -> list[TeamInfo]:
        return [g.winner for g in self.games if g.winner is not None]

    @property
    def upsets(self) -> list[BracketGame]:
        """Games where the higher seed (weaker team) won."""
        results = []
        for g in self.games:
            if g.winner and g.loser and g.winner.seed and g.loser.seed:
                if g.winner.seed > g.loser.seed:
                    results.append(g)
        return results


# ---------------------------------------------------------------------------
# Full bracket result
# ---------------------------------------------------------------------------

@dataclass
class BracketResult:
    """
    Complete output of build_bracket().

    rounds
        Ordered list from round 1 (first round / R64) through
        round 6 (Championship).  Each BracketRound contains all games
        in that round across all regions.

    champion
        TeamInfo of the predicted tournament winner.

    bracket_size
        16 or 64 — controls which round names and seeding logic was used.
    """
    profile_name: str
    season: int
    bracket_size: int
    rounds: list[BracketRound] = field(default_factory=list)
    champion: TeamInfo | None = None

    def get_round(self, round_num: int) -> BracketRound | None:
        return next((r for r in self.rounds if r.round_num == round_num), None)

    def champion_path(self) -> list[BracketGame]:
        """Return all games won by the champion, in round order."""
        if not self.champion:
            return []
        return [
            game
            for rnd in self.rounds
            for game in rnd.games
            if game.winner and game.winner.team_id == self.champion.team_id
        ]

    def all_upsets(self) -> list[BracketGame]:
        """All games where the lower seed (upset) won, across all rounds."""
        return [
            game
            for rnd in self.rounds
            for game in rnd.upsets
        ]

    def to_dict(self) -> dict:
        """Deep-convert to a plain dict suitable for JSON serialization."""
        return dataclasses.asdict(self)
