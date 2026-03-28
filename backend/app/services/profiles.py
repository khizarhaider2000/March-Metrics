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
    # Extended metrics
    "opp_ft_rate",
    "ast_pct",
    "three_pt_rate",
    "opp_three_pt_rate",
    "two_pt_pct",
    "opp_two_pt_pct",
    "steal_pct",
    "block_pct",
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
    # Extended metrics
    "opp_ft_rate":       False,  # fewer opp FTs drawn = cleaner defense
    "ast_pct":           True,   # more assisted FGs = better ball movement
    "three_pt_rate":     True,   # higher 3PA share = more explosive ceiling
    "opp_three_pt_rate": False,  # fewer opp 3PA = better perimeter deterrence
    "two_pt_pct":        True,   # better interior/mid-range shooting
    "opp_two_pt_pct":    False,  # lower opp 2P% = better interior defense
    "steal_pct":         True,   # more steals = more disruptive defense
    "block_pct":         True,   # more blocks = better rim protection
}

# ---------------------------------------------------------------------------
# Starter profiles
# ---------------------------------------------------------------------------

PROFILES: Final[dict[str, dict]] = {
    "balanced": {
        "description": "Equal emphasis across offense, defense, and efficiency.",
        "is_custom": False,
        "weights": WeightDict({
            "adj_em":            0.25,
            "adj_o":             0.12,  # ↑ offense undervalued per accuracy data
            "adj_d":             0.10,
            "efg_pct":           0.09,  # ↑ shooting variance matters
            "opp_efg_pct":       0.07,
            "to_pct":            0.05,
            "opp_to_pct":        0.06,  # ↑ forcing TOs predictive
            "orb_pct":           0.04,
            "drb_pct":           0.04,
            "ft_rate":           0.02,  # ↓ noise in single-elimination
            "tempo":             0.03,
            "sos":               0.02,  # ↓ schedule strength less predictive in tourney
            "opp_ft_rate":       0.01,  # ↓ minor signal
            "ast_pct":           0.02,
            "three_pt_rate":     0.04,  # ↑ 3PT variance drives upsets
            "opp_three_pt_rate": 0.01,
            "two_pt_pct":        0.02,
            "opp_two_pt_pct":    0.01,
            "steal_pct":         0.02,
            "block_pct":         0.01,
        }),
    },
    "offense-heavy": {
        "description": "Rewards elite offensive efficiency and shooting teams.",
        "is_custom": False,
        "weights": WeightDict({
            "adj_em":            0.15,
            "adj_o":             0.22,
            "adj_d":             0.04,
            "efg_pct":           0.13,
            "opp_efg_pct":       0.03,
            "to_pct":            0.07,
            "opp_to_pct":        0.02,
            "orb_pct":           0.06,
            "drb_pct":           0.02,
            "ft_rate":           0.05,
            "tempo":             0.04,
            "sos":               0.02,
            "opp_ft_rate":       0.01,
            "ast_pct":           0.04,
            "three_pt_rate":     0.04,  # ↑ 3PT matters for offense-first teams
            "opp_three_pt_rate": 0.01,
            "two_pt_pct":        0.03,
            "opp_two_pt_pct":    0.01,
            "steal_pct":         0.01,
            "block_pct":         0.01,
        }),
    },
    "defense-heavy": {
        "description": "Prioritizes stifling defenses and defensive rebounding.",
        "is_custom": False,
        "weights": WeightDict({
            "adj_em":            0.20,  # ↑ efficiency margin captures both sides
            "adj_o":             0.05,  # ↑ can't completely ignore offense
            "adj_d":             0.22,
            "efg_pct":           0.03,
            "opp_efg_pct":       0.13,
            "to_pct":            0.02,
            "opp_to_pct":        0.07,
            "orb_pct":           0.02,
            "drb_pct":           0.09,
            "ft_rate":           0.01,  # ↓ noise
            "tempo":             0.02,
            "sos":               0.04,  # ↓ less predictive in single elimination
            "opp_ft_rate":       0.04,
            "ast_pct":           0.01,
            "three_pt_rate":     0.01,
            "opp_three_pt_rate": 0.03,
            "two_pt_pct":        0.01,
            "opp_two_pt_pct":    0.03,
            "steal_pct":         0.03,
            "block_pct":         0.03,
        }),
    },
    "upset-hunter": {
        "description": (
            "Targets variance metrics — high 3PT rate, pace, and forced turnovers — "
            "to find teams that punch above their seed in chaotic single-elimination games."
        ),
        "is_custom": False,
        "weights": WeightDict({
            "adj_em":            0.06,  # ↓ devalue aggregate margin — upsets defy it
            "adj_o":             0.07,
            "adj_d":             0.07,
            "efg_pct":           0.09,  # ↑ shooting efficiency = chaos weapon
            "opp_efg_pct":       0.07,
            "to_pct":            0.08,  # ↑ ball security under tourney pressure
            "opp_to_pct":        0.10,  # ↑↑ forcing TOs is the #1 upset mechanism
            "orb_pct":           0.07,
            "drb_pct":           0.04,
            "ft_rate":           0.03,
            "tempo":             0.09,  # ↑↑ pace creates chaos against methodical favorites
            "sos":               0.02,  # ↓↓ mid-majors have weak SOS but win anyway
            "opp_ft_rate":       0.02,
            "ast_pct":           0.03,
            "three_pt_rate":     0.10,  # ↑↑ 3PT variance is the #1 seed-killer
            "opp_three_pt_rate": 0.03,
            "two_pt_pct":        0.03,
            "opp_two_pt_pct":    0.02,
            "steal_pct":         0.05,  # ↑ steals = live-ball TOs, momentum shifts
            "block_pct":         0.03,
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


# ---------------------------------------------------------------------------
# Round-specific weight multipliers
# ---------------------------------------------------------------------------
# Applied on top of base profile weights during bracket simulation.
# Keys: round_num (0=First Four, 1=R64, 2=R32, 3=Sweet 16, 4=Elite 8,
#                  5=Final Four, 6=Championship).
# Any metric not listed keeps a multiplier of 1.0 (no change).
# Rationale: what matters in early chaos rounds is not what wins championships.

ROUND_WEIGHT_MULTIPLIERS: Final[dict[int, dict[str, float]]] = {
    0: {},  # First Four — use base weights; play-in games are too noisy to adjust

    1: {    # Round of 64 — chaos round; variance and pace dominate
        "efg_pct":           1.35,  # shooting variance decides upsets
        "three_pt_rate":     1.55,  # 3PT rate = primary chaos metric
        "opp_three_pt_rate": 1.25,  # perimeter defense matters vs hot shooters
        "tempo":             1.40,  # pace creates chaos against methodical favorites
        "opp_to_pct":        1.45,  # forcing TOs = momentum swings in one game
        "to_pct":            1.30,  # ball security under tourney pressure
        "adj_o":             1.10,  # slight offensive boost
        "adj_em":            0.80,  # aggregate efficiency less predictive in chaos
        "sos":               0.55,  # schedule strength is noise in a neutral-site game
        "ft_rate":           0.70,  # FT rate is single-game noise
        "orb_pct":           0.80,
    },

    2: {    # Round of 32 — weak teams gone; trend toward efficiency
        "adj_em":            1.15,
        "adj_o":             1.10,
        "efg_pct":           1.15,
        "three_pt_rate":     1.10,
        "tempo":             1.15,
        "sos":               0.70,
        "ft_rate":           0.80,
    },

    3: {    # Sweet Sixteen — only elite teams remain; efficiency dominates
        "adj_em":            1.40,
        "adj_d":             1.35,
        "opp_efg_pct":       1.35,
        "adj_o":             1.20,
        "efg_pct":           1.15,
        "sos":               0.75,
        "ft_rate":           0.60,
        "three_pt_rate":     0.85,  # slight down — top defenses neutralize it
        "orb_pct":           0.70,
    },

    4: {    # Elite Eight — defense begins to win
        "adj_em":            1.50,
        "adj_d":             1.60,
        "opp_efg_pct":       1.50,
        "steal_pct":         1.30,
        "block_pct":         1.30,
        "drb_pct":           1.20,
        "ft_rate":           0.50,
        "three_pt_rate":     0.70,
        "orb_pct":           0.60,
        "sos":               0.85,
    },

    5: {    # Final Four — championship-caliber defense
        "adj_em":            1.50,
        "adj_d":             1.80,
        "opp_efg_pct":       1.60,
        "steal_pct":         1.40,
        "block_pct":         1.40,
        "drb_pct":           1.30,
        "ft_rate":           0.45,
        "three_pt_rate":     0.60,
        "orb_pct":           0.50,
    },

    6: {    # Championship — defense wins championships
        "adj_em":            1.45,
        "adj_d":             2.00,
        "opp_efg_pct":       1.80,
        "steal_pct":         1.50,
        "block_pct":         1.50,
        "drb_pct":           1.40,
        "adj_o":             0.90,
        "ft_rate":           0.40,
        "three_pt_rate":     0.50,
        "orb_pct":           0.40,
        "tempo":             0.60,
    },
}


# ---------------------------------------------------------------------------
# Historical R64 seed upset compression factors
# ---------------------------------------------------------------------------
# Compresses the score gap toward 50/50 for matchups with known upset history.
# Factor of 0.65 means the gap is compressed to 65% of its model-computed size.
# Source: historical NCAA tournament upset rates (1985–2024).

SEED_UPSET_COMPRESSION: Final[dict[tuple[int, int], float]] = {
    (1, 16): 0.95,  # 16 beats 1 ~1%
    (2, 15): 0.92,  # 15 beats 2 ~6%
    (3, 14): 0.88,  # 14 beats 3 ~15%
    (4, 13): 0.82,  # 13 beats 4 ~21%
    (5, 12): 0.72,  # 12 beats 5 ~35% — classic upset matchup
    (6, 11): 0.70,  # 11 beats 6 ~37%
    (7, 10): 0.68,  # 10 beats 7 ~40%
    (8,  9): 0.65,  # 9 beats 8  ~49% — essentially a coin flip
}


def get_effective_weights(
    profile_name: str,
    round_num: int | None,
) -> WeightDict:
    """
    Return weights for *profile_name* scaled by the round-specific multipliers.

    For round_num=None (e.g. standalone Matchup Analyzer), returns the
    base profile weights unchanged so existing behavior is unaffected.
    """
    base = get_profile_weights(profile_name)
    if round_num is None:
        return base

    multipliers = ROUND_WEIGHT_MULTIPLIERS.get(round_num, {})
    if not multipliers:
        return base

    return {
        metric: weight * multipliers.get(metric, 1.0)
        for metric, weight in base.items()
    }
