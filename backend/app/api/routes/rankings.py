from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.limiter import limiter

from app.api.dependencies import fetch_teams_for_season, orm_team_to_input
from app.api.schemas import RankedTeamOut, RankingsResponse
from app.db.session import get_db
from app.services.scoring import compute_march_scores

router = APIRouter()


@limiter.limit("30/minute")
@router.get(
    "/rankings",
    response_model=RankingsResponse,
    summary="Get team rankings by March Score",
    description=(
        "Scores every team in the season using the selected weight profile "
        "and returns them ranked 1–N by March Score. "
        "Each team includes its raw metrics and per-metric percentile ranks. "
        "Built-in profiles: balanced | offense-heavy | defense-heavy | upset-hunter."
    ),
)
def get_rankings(
    request: Request,
    season:  int = Query(..., description="Tournament season year, e.g. 2026"),
    profile: str = Query("balanced", description="Weight profile name"),
    db: Session = Depends(get_db),
) -> RankingsResponse:
    rows = fetch_teams_for_season(db, season)
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No teams found for season {season}.",
        )

    team_inputs = [orm_team_to_input(t) for t in rows]

    try:
        result = compute_march_scores(team_inputs, profile)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))

    ranked = [
        RankedTeamOut(
            rank=t.rank,
            team_id=t.team_id,
            team_name=t.team_name,
            seed=t.seed,
            region=t.region,
            conference=t.conference,
            record_wins=t.record_wins,
            record_losses=t.record_losses,
            season=t.season,
            march_score=t.march_score,
            metric_percentiles=t.metric_percentiles,
            raw_metrics=t.raw_metrics,
        )
        for t in result.teams
    ]

    return RankingsResponse(
        profile=result.profile_name,
        season=result.season,
        count=len(ranked),
        teams=ranked,
    )
