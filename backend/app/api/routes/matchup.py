from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies import fetch_team_by_id, orm_team_to_input
from app.api.schemas import CategoryEdgeOut, MatchupResponse, MatchupTeamOut
from app.db.session import get_db
from app.services.matchup import analyze_matchup

router = APIRouter()


@router.get(
    "/matchup",
    response_model=MatchupResponse,
    summary="Compare two teams head-to-head",
    description=(
        "Runs a head-to-head matchup simulation between two teams using "
        "the selected weight profile. Returns the projected winner, score gap, "
        "category-level edges (offense, defense, rebounding, etc.), "
        "and a plain-English explanation of the pick."
    ),
)
def get_matchup(
    team_a_id: int = Query(..., description="Primary key of the first team"),
    team_b_id: int = Query(..., description="Primary key of the second team"),
    profile:   str = Query("balanced", description="Weight profile name"),
    db: Session = Depends(get_db),
) -> MatchupResponse:
    if team_a_id == team_b_id:
        raise HTTPException(
            status_code=400,
            detail="team_a_id and team_b_id must be different.",
        )

    row_a = fetch_team_by_id(db, team_a_id)
    row_b = fetch_team_by_id(db, team_b_id)

    if not row_a:
        raise HTTPException(status_code=404, detail=f"Team {team_a_id} not found.")
    if not row_b:
        raise HTTPException(status_code=404, detail=f"Team {team_b_id} not found.")

    team_a = orm_team_to_input(row_a)
    team_b = orm_team_to_input(row_b)

    try:
        result = analyze_matchup(team_a, team_b, profile)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))

    def _scored_team_out(scored) -> MatchupTeamOut:
        return MatchupTeamOut(
            team_id=scored.team_id,
            team_name=scored.team_name,
            seed=scored.seed,
            region=scored.region,
            conference=scored.conference,
            record_wins=scored.record_wins,
            record_losses=scored.record_losses,
            march_score=scored.march_score,
        )

    category_edges = [
        CategoryEdgeOut(
            category=e.category,
            label=e.label,
            team_a_score=e.team_a_score,
            team_b_score=e.team_b_score,
            gap=e.gap,
            edge_strength=e.edge_strength,
            winner_name=e.winner_name,
        )
        for e in result.category_edges
    ]

    return MatchupResponse(
        profile=result.profile_name,
        winner=_scored_team_out(result.winner),
        loser=_scored_team_out(result.loser),
        score_gap=result.score_gap,
        confidence=result.confidence,
        top_reasons=result.top_reasons,
        explanation=result.explanation,
        category_edges=category_edges,
    )
