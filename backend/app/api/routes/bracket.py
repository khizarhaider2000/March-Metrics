from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.limiter import limiter

from app.api.dependencies import fetch_teams_for_season, orm_team_to_input
from app.api.schemas import (
    BracketGameOut,
    BracketResponse,
    BracketRoundOut,
    BracketTeamOut,
)
from app.db.session import get_db
from app.schemas.bracket import BracketGame, BracketResult, TeamInfo
from app.services.bracket import build_bracket

router = APIRouter()


# ---------------------------------------------------------------------------
# Internal converters: internal dataclasses → Pydantic response models
# ---------------------------------------------------------------------------

def _team_info_out(info: TeamInfo | None) -> BracketTeamOut | None:
    if info is None:
        return None
    return BracketTeamOut(
        team_id=info.team_id,
        team_name=info.team_name,
        seed=info.seed,
        region=info.region,
        conference=info.conference,
        record_wins=info.record_wins,
        record_losses=info.record_losses,
    )


def _game_out(game: BracketGame) -> BracketGameOut:
    return BracketGameOut(
        game_id=game.game_id,
        round_num=game.round_num,
        round_name=game.round_name,
        region=game.region,
        slot=game.slot,
        team_a=_team_info_out(game.team_a),
        team_b=_team_info_out(game.team_b),
        winner=_team_info_out(game.winner),
        loser=_team_info_out(game.loser),
        winner_march_score=game.winner_march_score,
        loser_march_score=game.loser_march_score,
        score_gap=game.score_gap,
        confidence=game.confidence,
        top_reasons=game.top_reasons,
        explanation=game.explanation,
        category_edges=game.category_edges,   # already list[dict]
    )


def _bracket_result_to_response(result: BracketResult) -> BracketResponse:
    rounds = [
        BracketRoundOut(
            round_num=rnd.round_num,
            round_name=rnd.round_name,
            games=[_game_out(g) for g in rnd.games],
        )
        for rnd in result.rounds
    ]
    return BracketResponse(
        profile=result.profile_name,
        season=result.season,
        bracket_size=result.bracket_size,
        champion=_team_info_out(result.champion),
        rounds=rounds,
    )


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@limiter.limit("10/minute")
@router.get(
    "/bracket",
    response_model=BracketResponse,
    summary="Generate a full tournament bracket",
    description=(
        "Auto-fills a complete NCAA tournament bracket for the given season "
        "using the selected weight profile. Every game is simulated via the "
        "matchup engine; winners advance round-by-round until a champion is crowned. "
        "Response includes every game with its projected winner, score gap, "
        "confidence level, and plain-English explanation. "
        "Note: computation runs on each request "
        "(63 games for a 64-team field, 67 when First Four is present). "
        "Built-in profiles: balanced | offense-heavy | defense-heavy | upset-hunter."
    ),
)
def get_bracket(
    request: Request,
    season:  int = Query(..., description="Tournament season year, e.g. 2026"),
    profile: str = Query("balanced", description="Weight profile name"),
    db: Session = Depends(get_db),
) -> BracketResponse:
    rows = fetch_teams_for_season(db, season)
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No teams found for season {season}. "
                   f"Run the seed script to populate the database.",
        )

    team_inputs = [orm_team_to_input(t) for t in rows]

    try:
        result = build_bracket(team_inputs, profile, season=season)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return _bracket_result_to_response(result)
