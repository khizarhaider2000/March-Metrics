from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import fetch_all_profiles
from app.api.schemas import ProfileOut, ProfilesResponse
from app.db.session import get_db

router = APIRouter()


@router.get(
    "/profiles",
    response_model=ProfilesResponse,
    summary="List weight profiles",
    description=(
        "Returns all available weight profiles. "
        "Built-in profiles (balanced, offense-heavy, defense-heavy, upset-hunter) "
        "are seeded at startup. Custom profiles created by users also appear here."
    ),
)
def list_profiles(db: Session = Depends(get_db)) -> ProfilesResponse:
    rows = fetch_all_profiles(db)
    profiles = [
        ProfileOut(
            name=p.name,
            description=p.description,
            is_custom=p.is_custom,
            weights=p.weights,          # deserializes weights_json via the model property
        )
        for p in rows
    ]
    return ProfilesResponse(count=len(profiles), profiles=profiles)
