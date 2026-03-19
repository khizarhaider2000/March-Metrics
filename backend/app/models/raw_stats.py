"""
app/models/raw_stats.py

Raw counting stats imported from the NCAA API.
One row per team per season. Stored so derived metrics can be recomputed
without re-fetching and so the source data is auditable.

All integer fields are season totals (not per-game).
"""
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

from app.db.base import Base


class RawTeamStats(Base):
    __tablename__ = "raw_team_stats"

    id       = Column(Integer, primary_key=True, index=True)
    team_id  = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, unique=True)
    source   = Column(String, nullable=False, default="ncaa-api")  # provenance tag
    fetched_at = Column(String, nullable=True)                     # ISO-8601 UTC timestamp

    # Games
    gp     = Column(Integer, nullable=True)   # games played
    wins   = Column(Integer, nullable=True)
    losses = Column(Integer, nullable=True)

    # Scoring (season totals)
    pts     = Column(Integer, nullable=True)   # points scored
    opp_pts = Column(Integer, nullable=True)   # points allowed

    # Field goals — team
    fgm  = Column(Integer, nullable=True)
    fga  = Column(Integer, nullable=True)
    fg3m = Column(Integer, nullable=True)
    fg3a = Column(Integer, nullable=True)

    # Free throws — team
    ftm = Column(Integer, nullable=True)
    fta = Column(Integer, nullable=True)

    # Field goals — opponent
    opp_fgm  = Column(Integer, nullable=True)
    opp_fga  = Column(Integer, nullable=True)
    opp_fg3m = Column(Integer, nullable=True)
    opp_fg3a = Column(Integer, nullable=True)

    # Rebounds (totals)
    trb     = Column(Integer, nullable=True)   # team total rebounds
    opp_trb = Column(Integer, nullable=True)   # opponent total rebounds

    # Turnovers (totals)
    tov     = Column(Integer, nullable=True)   # team turnovers committed
    opp_tov = Column(Integer, nullable=True)   # opponent turnovers committed

    # Playmaking / pressure (totals)
    ast = Column(Integer, nullable=True)   # team assists
    stl = Column(Integer, nullable=True)   # team steals
    blk = Column(Integer, nullable=True)   # team blocks

    team = relationship("Team", back_populates="raw_stats")

    def __repr__(self) -> str:
        return f"<RawTeamStats team_id={self.team_id} source={self.source!r}>"
