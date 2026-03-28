"""
app/services/accuracy.py

Compares each built-in profile's generated bracket against actual tournament
results stored in backend/app/data/actual_brackets/{season}.json.

Only games with a recorded actual winner are evaluated — partially complete
tournaments are handled naturally by simply having fewer entries in the file.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.schemas.scoring import TeamInput
from app.services.bracket import build_bracket
from app.services.profiles import PROFILES

# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

_DATA_DIR = Path(__file__).parent.parent / "data" / "actual_brackets"


def load_actual_results(season: int) -> dict[str, Any] | None:
    """Return parsed JSON for the given season, or None if the file is missing."""
    path = _DATA_DIR / f"{season}.json"
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _build_actual_lookup(actual: dict[str, Any]) -> dict[tuple, str]:
    """
    Return a dict keyed by (round_num, region, slot) → winner_team_name (lowercase).
    Only entries that have all required fields are included.
    """
    lookup: dict[tuple, str] = {}
    for entry in actual.get("games", []):
        try:
            key = (
                int(entry["round_num"]),
                entry.get("region"),   # None for Final Four / Championship
                int(entry["slot"]),
            )
            lookup[key] = entry["winner_team_name"].lower().strip()
        except (KeyError, TypeError, ValueError):
            continue  # skip malformed entries
    return lookup


# ---------------------------------------------------------------------------
# Core comparison logic
# ---------------------------------------------------------------------------

def compute_bracket_accuracy(
    team_inputs: list[TeamInput],
    season: int,
) -> dict[str, Any]:
    """
    Generate a bracket for every built-in profile and compare each predicted
    winner to the actual results on file.

    Returns a dict ready to be unpacked into AccuracyResponse.
    Raises FileNotFoundError if no results file exists for the season.
    """
    actual = load_actual_results(season)
    if actual is None:
        raise FileNotFoundError(
            f"No actual results file found for season {season}. "
            f"Create backend/app/data/actual_brackets/{season}.json to enable accuracy tracking."
        )

    actual_lookup = _build_actual_lookup(actual)
    evaluated_games = len(actual_lookup)

    profile_results = []

    for profile_name in PROFILES:
        bracket = build_bracket(team_inputs, profile_name, season)

        correct = 0
        evaluated = 0
        rounds_stats: dict[int, dict] = {}

        for rnd in bracket.rounds:
            r_correct = 0
            r_total = 0

            for game in rnd.games:
                key = (game.round_num, game.region, game.slot)
                if key not in actual_lookup:
                    continue
                if game.winner is None:
                    continue

                evaluated += 1
                r_total += 1

                if game.winner.team_name.lower().strip() == actual_lookup[key]:
                    correct += 1
                    r_correct += 1

            if r_total > 0:
                rounds_stats[rnd.round_num] = {
                    "round_num": rnd.round_num,
                    "round_name": rnd.round_name,
                    "correct_picks": r_correct,
                    "evaluated_picks": r_total,
                    "accuracy_pct": round(r_correct / r_total * 100, 2),
                }

        profile_results.append({
            "profile": profile_name,
            "correct_picks": correct,
            "evaluated_picks": evaluated,
            "accuracy_pct": round(correct / evaluated * 100, 2) if evaluated > 0 else 0.0,
            "rounds": list(rounds_stats.values()),
        })

    return {
        "season": season,
        "evaluated_games": evaluated_games,
        "profiles": profile_results,
    }
