from sqlalchemy import Column, Integer, String, Float, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.base import Base


class Team(Base):
    """
    One row per team per season.
    A team that returns the following year gets a new row (different season).
    """
    __tablename__ = "teams"
    __table_args__ = (
        UniqueConstraint("season", "team_name", name="uq_team_season"),
    )

    id = Column(Integer, primary_key=True, index=True)
    season = Column(Integer, nullable=False, index=True)   # e.g. 2026
    team_name = Column(String, nullable=False)
    seed = Column(Integer, nullable=True)                  # 1-16; None = play-in
    region = Column(String, nullable=True)                 # East/West/South/Midwest
    conference = Column(String, nullable=True)
    record_wins = Column(Integer, nullable=False, default=0)
    record_losses = Column(Integer, nullable=False, default=0)

    # Relationships
    metrics   = relationship("TeamMetrics",   back_populates="team", uselist=False, cascade="all, delete-orphan")
    raw_stats = relationship("RawTeamStats",  back_populates="team", uselist=False, cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Team {self.season} #{self.seed} {self.team_name}>"


class TeamMetrics(Base):
    """
    Advanced box-score metrics for a team in a given season.
    One-to-one with Team (same season scope).

    Metric glossary:
      adj_em      – Adjusted Efficiency Margin (offense minus defense)
      adj_o       – Adjusted Offensive Efficiency (pts per 100 possessions)
      adj_d       – Adjusted Defensive Efficiency (pts allowed per 100 possessions)
      efg_pct     – Effective Field Goal % (team)
      opp_efg_pct – Effective Field Goal % (opponent)
      to_pct      – Turnover % (team)
      opp_to_pct  – Turnover % (opponent; higher = better defense)
      orb_pct     – Offensive Rebound %
      drb_pct     – Defensive Rebound %
      ft_rate     – Free Throw Rate (FTA / FGA)
      tempo       – Adjusted possessions per 40 minutes
      sos         – Strength of Schedule (avg opponent adj_em)
    """
    __tablename__ = "team_metrics"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, unique=True)

    adj_em = Column(Float, nullable=True)
    adj_o = Column(Float, nullable=True)
    adj_d = Column(Float, nullable=True)
    efg_pct = Column(Float, nullable=True)
    opp_efg_pct = Column(Float, nullable=True)
    to_pct = Column(Float, nullable=True)
    opp_to_pct = Column(Float, nullable=True)
    orb_pct = Column(Float, nullable=True)
    drb_pct = Column(Float, nullable=True)
    ft_rate = Column(Float, nullable=True)
    tempo = Column(Float, nullable=True)
    sos = Column(Float, nullable=True)

    # Extended metrics (computed from raw counting stats)
    opp_ft_rate      = Column(Float, nullable=True)  # opp ftm per fga (lower = better defense)
    ast_pct          = Column(Float, nullable=True)  # assists / fgm
    three_pt_rate    = Column(Float, nullable=True)  # fg3a / fga
    opp_three_pt_rate= Column(Float, nullable=True)  # opp_fg3a / opp_fga
    two_pt_pct       = Column(Float, nullable=True)  # (fgm-fg3m) / (fga-fg3a)
    opp_two_pt_pct   = Column(Float, nullable=True)  # opp 2-point shooting %
    steal_pct        = Column(Float, nullable=True)  # stl / opp_fga
    block_pct        = Column(Float, nullable=True)  # blk / opp 2PA

    # Relationships
    team = relationship("Team", back_populates="metrics")

    def __repr__(self) -> str:
        return f"<TeamMetrics team_id={self.team_id} adj_em={self.adj_em}>"
