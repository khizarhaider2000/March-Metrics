"""
app/services/profiles.py

Canonical weight profile definitions — single source of truth.

All other modules (init_db, scoring service, future API endpoints)
should import from here rather than defining weights inline.

Each profile maps every TeamMetrics field to a float weight.
Weights are declared as-authored (may not sum to exactly 1.0).
The scoring engine always re-normalizes before computing scores,
so the absolute magnitudes here only express relative emphasis.
"""

from __future__ import annotations
from typing import Final

# ---------------------------------------------------------------------------
# Type alias
# ---------------------------------------------------------------------------

WeightDict = dict[str, float]

# ---------------------------------------------------------------------------
# Ordered list of all scorable metric fields (matches TeamMetrics columns)
# ---------------------------------------------------------------------------

METRIC_FIELDS: Final[tuple[str, ...]] = (
    "adj_em",
    "adj_o",
    "adj_d",
    "efg_pct",
    "opp_efg_pct",
    "to_pct",
    "opp_to_pct",
    "orb_pct",
    "drb_pct",
    "ft_rate",
    "tempo",
    "sos",
)

# ---------------------------------------------------------------------------
# Stat direction: True = higher is better, False = lower is better
# ---------------------------------------------------------------------------

METRIC_DIRECTION: Final[dict[str, bool]] = {
    "adj_em":      True,   # larger margin = better team
    "adj_o":       True,   # more pts per 100 possessions = better offense
    "adj_d":       False,  # fewer pts allowed = better defense
    "efg_pct":     True,   # shoot more efficiently
    "opp_efg_pct": False,  # hold opponents to lower shooting
    "to_pct":      False,  # fewer turnovers = better ball security
    "opp_to_pct":  True,   # force more opponent turnovers
    "orb_pct":     True,   # more offensive boards = better
    "drb_pct":     True,   # more defensive boards = better
    "ft_rate":     True,   # get to the line more
    "tempo":       True,   # faster pace (profile-dependent but default higher)
    "sos":         True,   # tougher schedule = more battle-tested
}

# ---------------------------------------------------------------------------
# Starter profiles
# ---------------------------------------------------------------------------

PROFILES: Final[dict[str, dict]] = {
    "balanced": {
        "description": "Equal emphasis across offense, defense, and efficiency.",
        "is_custom": False,
        "weights": WeightDict({
            "adj_em":      0.25,
            "adj_o":       0.12,
            "adj_d":       0.12,
            "efg_pct":     0.08,
            "opp_efg_pct": 0.08,
            "to_pct":      0.06,
            "opp_to_pct":  0.06,
            "orb_pct":     0.05,
            "drb_pct":     0.05,
            "ft_rate":     0.04,
            "tempo":       0.04,
            "sos":         0.05,
        }),
    },
    "offense-heavy": {
        "description": "Rewards elite offensive efficiency and shooting teams.",
        "is_custom": False,
        "weights": WeightDict({
            "adj_em":      0.15,
            "adj_o":       0.25,
            "adj_d":       0.05,
            "efg_pct":     0.15,
            "opp_efg_pct": 0.04,
            "to_pct":      0.08,
            "opp_to_pct":  0.03,
            "orb_pct":     0.07,
            "drb_pct":     0.03,
            "ft_rate":     0.07,
            "tempo":       0.05,
            "sos":         0.03,
        }),
    },
    "defense-heavy": {
        "description": "Prioritizes stifling defenses and defensive rebounding.",
        "is_custom": False,
        "weights": WeightDict({
            "adj_em":      0.15,
            "adj_o":       0.05,
            "adj_d":       0.25,
            "efg_pct":     0.04,
            "opp_efg_pct": 0.15,
            "to_pct":      0.03,
            "opp_to_pct":  0.08,
            "orb_pct":     0.03,
            "drb_pct":     0.10,
            "ft_rate":     0.03,
            "tempo":       0.02,
            "sos":         0.07,
        }),
    },
    "upset-hunter": {
        "description": (
            "Flat weights that reward pace, ball security, and rebounding — "
            "favors gritty mid-majors over slow, offense-dependent favorites."
        ),
        "is_custom": False,
        "weights": WeightDict({
            "adj_em":      0.10,
            "adj_o":       0.10,
            "adj_d":       0.10,
            "efg_pct":     0.10,
            "opp_efg_pct": 0.10,
            "to_pct":      0.08,
            "opp_to_pct":  0.08,
            "orb_pct":     0.08,
            "drb_pct":     0.06,
            "ft_rate":     0.06,
            "tempo":       0.08,
            "sos":         0.06,
        }),
    },
}

# Flat list form used by init_db.py seeder
STARTER_PROFILES: Final[list[dict]] = [
    {"name": name, **data}
    for name, data in PROFILES.items()
]


def get_profile_weights(profile_name: str) -> WeightDict:
    """
    Return the weight dict for a built-in profile.
    Raises KeyError if the profile name is not found.
    """
    if profile_name not in PROFILES:
        available = ", ".join(PROFILES)
        raise KeyError(
            f"Unknown profile '{profile_name}'. Available: {available}"
        )
    return PROFILES[profile_name]["weights"]
