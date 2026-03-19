# Import all models here so that SQLAlchemy's metadata is fully populated
# before create_all() is called in init_db.py.
from app.models.team import Team, TeamMetrics          # noqa: F401
from app.models.raw_stats import RawTeamStats          # noqa: F401
from app.models.weight_profile import WeightProfile    # noqa: F401
from app.models.bracket import BracketGame             # noqa: F401
