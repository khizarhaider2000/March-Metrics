from fastapi import APIRouter
from app.api.schemas import HealthResponse

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Returns service status. Use this to verify the API is reachable.",
)
def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="march-metrics-api",
        version="0.1.0",
    )
