from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.routes import bracket, health, matchup, profiles, rankings, teams
from app.db.init_db import init_db
from app.limiter import limiter


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables and seed reference data on first startup."""
    init_db()
    yield


app = FastAPI(
    title="March Metrics API",
    description=(
        "Backend for the March Metrics NCAA Bracket Builder. "
        "Exposes team data, advanced metric rankings, head-to-head matchup "
        "analysis, and full bracket simulation — all driven by configurable "
        "weight profiles."
    ),
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers — all mounted under /api
# ---------------------------------------------------------------------------
_PREFIX = "/api"

app.include_router(health.router,    prefix=_PREFIX, tags=["Health"])
app.include_router(profiles.router,  prefix=_PREFIX, tags=["Profiles"])
app.include_router(teams.router,     prefix=_PREFIX, tags=["Teams"])
app.include_router(rankings.router,  prefix=_PREFIX, tags=["Rankings"])
app.include_router(matchup.router,   prefix=_PREFIX, tags=["Matchup"])
app.include_router(bracket.router,   prefix=_PREFIX, tags=["Bracket"])
