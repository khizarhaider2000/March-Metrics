"""
app/api/dependencies.py

Reusable FastAPI dependencies and DB query helpers.

All functions that translate ORM rows into service-layer TeamInput objects
live here — routes stay thin, the service layer stays DB-agnostic.
"""

from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from app.models.team import Team, TeamMetrics
from app.models.weight_profile import WeightProfile
from app.schemas.scoring import TeamInput


# ---------------------------------------------------------------------------
# ORM → TeamInput conversion
# ---------------------------------------------------------------------------

def orm_team_to_input(team: Team) -> TeamInput:
    """Convert a SQLAlchemy Team (with .metrics loaded) to a TeamInput."""
    m: TeamMetrics | None = team.metrics
    return TeamInput(
        team_id=team.id,
        team_name=team.team_name,
        seed=team.seed,
        region=team.region,
        conference=team.conference,
        season=team.season,
        record_wins=team.record_wins,
        record_losses=team.record_losses,
        adj_em=m.adj_em           if m else None,
        adj_o=m.adj_o             if m else None,
        adj_d=m.adj_d             if m else None,
        efg_pct=m.efg_pct         if m else None,
        opp_efg_pct=m.opp_efg_pct if m else None,
        to_pct=m.to_pct           if m else None,
        opp_to_pct=m.opp_to_pct   if m else None,
        orb_pct=m.orb_pct         if m else None,
        drb_pct=m.drb_pct         if m else None,
        ft_rate=m.ft_rate         if m else None,
        tempo=m.tempo             if m else None,
        sos=m.sos                 if m else None,
        opp_ft_rate=m.opp_ft_rate           if m else None,
        ast_pct=m.ast_pct                   if m else None,
        three_pt_rate=m.three_pt_rate       if m else None,
        opp_three_pt_rate=m.opp_three_pt_rate if m else None,
        two_pt_pct=m.two_pt_pct             if m else None,
        opp_two_pt_pct=m.opp_two_pt_pct     if m else None,
        steal_pct=m.steal_pct               if m else None,
        block_pct=m.block_pct               if m else None,
    )


# ---------------------------------------------------------------------------
# DB query helpers
# ---------------------------------------------------------------------------

def fetch_teams_for_season(db: Session, season: int) -> list[Team]:
    """Return all Team rows for a season, with metrics eagerly loaded."""
    return (
        db.query(Team)
        .filter(Team.season == season)
        .options(joinedload(Team.metrics))
        .order_by(Team.region, Team.seed)
        .all()
    )


def fetch_team_by_id(db: Session, team_id: int) -> Team | None:
    """Return one Team row by primary key, with metrics eagerly loaded."""
    return (
        db.query(Team)
        .filter(Team.id == team_id)
        .options(joinedload(Team.metrics))
        .first()
    )


def fetch_all_profiles(db: Session) -> list[WeightProfile]:
    """Return all weight profiles ordered by name."""
    return db.query(WeightProfile).order_by(WeightProfile.name).all()


def fetch_profile_by_name(db: Session, name: str) -> WeightProfile | None:
    """Return a single weight profile by name, or None if not found."""
    return db.query(WeightProfile).filter(WeightProfile.name == name).first()
