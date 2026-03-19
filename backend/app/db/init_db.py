import json
import logging

from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.session import engine, SessionLocal
from app.services.profiles import STARTER_PROFILES  # canonical source
import app.models  # noqa: F401 – registers all models with Base.metadata

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def create_tables() -> None:
    """Create all tables if they do not exist."""
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created (if not already present).")


def seed_weight_profiles(db: Session) -> None:
    """Upsert starter weight profiles — always syncs weights from profiles.py."""
    from app.models.weight_profile import WeightProfile

    for profile_data in STARTER_PROFILES:
        wp = db.query(WeightProfile).filter_by(name=profile_data["name"]).first()
        if wp is None:
            wp = WeightProfile(name=profile_data["name"])
            db.add(wp)
        wp.description  = profile_data["description"]
        wp.weights_json = json.dumps(profile_data["weights"])
        wp.is_custom    = profile_data["is_custom"]

    db.commit()
    logger.info("Starter weight profiles synced.")


def init_db() -> None:
    """Full initialization: create tables then seed reference data."""
    create_tables()
    db = SessionLocal()
    try:
        seed_weight_profiles(db)
    finally:
        db.close()
