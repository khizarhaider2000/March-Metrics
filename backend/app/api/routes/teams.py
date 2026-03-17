from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies import fetch_team_by_id, fetch_teams_for_season
from app.api.schemas import MetricsDict, TeamDetailOut, TeamOut, TeamsResponse
from app.db.session import get_db

router = APIRouter()


@router.get(
    "/teams",
    response_model=TeamsResponse,
    summary="List teams for a season",
    description=(
        "Returns all tournament teams for the given season. "
        "Includes seed, region, conference, and win-loss record. "
        "Metrics are not included here — use /teams/{team_id} for full detail "
        "or /rankings for metric-based scoring."
    ),
)
def list_teams(
    season: int = Query(..., description="Tournament season year, e.g. 2026"),
    db: Session = Depends(get_db),
) -> TeamsResponse:
    rows = fetch_teams_for_season(db, season)
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No teams found for season {season}. "
                   f"Run the seed script to populate the database.",
        )
    teams = [
        TeamOut(
            team_id=t.id,
            team_name=t.team_name,
            seed=t.seed,
            region=t.region,
            conference=t.conference,
            record_wins=t.record_wins,
            record_losses=t.record_losses,
            season=t.season,
        )
        for t in rows
    ]
    return TeamsResponse(season=season, count=len(teams), teams=teams)


@router.get(
    "/teams/{team_id}",
    response_model=TeamDetailOut,
    summary="Get one team with metrics",
    description=(
        "Returns full detail for a single team including all twelve advanced metrics. "
        "Metric values may be null if data has not been loaded for this team."
    ),
)
def get_team(
    team_id: int,
    db: Session = Depends(get_db),
) -> TeamDetailOut:
    row = fetch_team_by_id(db, team_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Team {team_id} not found.")

    m = row.metrics
    return TeamDetailOut(
        team_id=row.id,
        team_name=row.team_name,
        seed=row.seed,
        region=row.region,
        conference=row.conference,
        record_wins=row.record_wins,
        record_losses=row.record_losses,
        season=row.season,
        metrics=MetricsDict(
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
        ),
    )
