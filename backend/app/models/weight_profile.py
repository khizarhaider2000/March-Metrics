import json
from sqlalchemy import Column, Integer, String, Boolean, Text
from app.db.base import Base


class WeightProfile(Base):
    """
    A named set of metric weights used to score and simulate matchups.

    weights_json stores a JSON object mapping each TeamMetrics field
    to a float weight (0.0–1.0). Weights should sum to 1.0 by convention
    but the simulation layer is responsible for normalizing.

    Example weights_json:
        {
            "adj_em":      0.25,
            "adj_o":       0.15,
            "adj_d":       0.15,
            "efg_pct":     0.10,
            "opp_efg_pct": 0.10,
            "to_pct":      0.05,
            "opp_to_pct":  0.05,
            "orb_pct":     0.05,
            "drb_pct":     0.05,
            "ft_rate":     0.02,
            "tempo":       0.01,
            "sos":         0.02
        }

    is_custom=False → built-in starter profile (not deletable by users).
    is_custom=True  → user-created profile.
    """
    __tablename__ = "weight_profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(String, nullable=True)
    weights_json = Column(Text, nullable=False)
    is_custom = Column(Boolean, nullable=False, default=False)

    @property
    def weights(self) -> dict:
        """Deserialize weights_json → dict for use in Python."""
        return json.loads(self.weights_json)

    def __repr__(self) -> str:
        return f"<WeightProfile '{self.name}' custom={self.is_custom}>"
