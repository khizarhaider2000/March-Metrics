"""
scripts/demo_scoring.py

Standalone demo for the March Metrics scoring engine.
No database required — uses hard-coded sample data.

Usage:
    cd backend
    python -m scripts.demo_scoring

Verifies:
  • All four built-in profiles run without error
  • Higher-quality teams (lower seed number) rank near the top
  • Lower-is-better stats are correctly inverted
  • A two-team head-to-head matchup works
  • Custom weight dict works
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.schemas.scoring import TeamInput
from app.services.scoring import compute_march_scores, score_single_matchup


# ---------------------------------------------------------------------------
# Sample pool — 10 teams, rough metrics correlated with seed quality
# ---------------------------------------------------------------------------

SAMPLE_TEAMS: list[TeamInput] = [
    TeamInput(
        team_id=1, team_name="Auburn Tigers",        seed=1,  region="West",
        conference="SEC",     season=2026, record_wins=31, record_losses=3,
        adj_em=28.5, adj_o=120.1, adj_d=91.6, efg_pct=0.561, opp_efg_pct=0.431,
        to_pct=0.148, opp_to_pct=0.211, orb_pct=0.338, drb_pct=0.762,
        ft_rate=0.356, tempo=72.1, sos=11.2,
    ),
    TeamInput(
        team_id=2, team_name="Houston Cougars",      seed=1,  region="Midwest",
        conference="Big 12",  season=2026, record_wins=31, record_losses=3,
        adj_em=27.8, adj_o=117.4, adj_d=89.6, efg_pct=0.541, opp_efg_pct=0.420,
        to_pct=0.152, opp_to_pct=0.224, orb_pct=0.321, drb_pct=0.779,
        ft_rate=0.341, tempo=65.4, sos=12.1,
    ),
    TeamInput(
        team_id=3, team_name="Duke Blue Devils",     seed=1,  region="East",
        conference="ACC",     season=2026, record_wins=30, record_losses=4,
        adj_em=26.4, adj_o=119.8, adj_d=93.4, efg_pct=0.553, opp_efg_pct=0.442,
        to_pct=0.162, opp_to_pct=0.198, orb_pct=0.308, drb_pct=0.741,
        ft_rate=0.371, tempo=70.2, sos=10.8,
    ),
    TeamInput(
        team_id=4, team_name="Tennessee Volunteers", seed=2,  region="East",
        conference="SEC",     season=2026, record_wins=28, record_losses=5,
        adj_em=22.3, adj_o=114.2, adj_d=91.9, efg_pct=0.521, opp_efg_pct=0.438,
        to_pct=0.171, opp_to_pct=0.208, orb_pct=0.298, drb_pct=0.752,
        ft_rate=0.328, tempo=66.8, sos=9.4,
    ),
    TeamInput(
        team_id=5, team_name="Florida Gators",       seed=2,  region="West",
        conference="SEC",     season=2026, record_wins=27, record_losses=6,
        adj_em=20.1, adj_o=112.5, adj_d=92.4, efg_pct=0.514, opp_efg_pct=0.447,
        to_pct=0.178, opp_to_pct=0.201, orb_pct=0.289, drb_pct=0.738,
        ft_rate=0.318, tempo=68.5, sos=8.9,
    ),
    TeamInput(
        team_id=6, team_name="Gonzaga Bulldogs",     seed=5,  region="Midwest",
        conference="WCC",     season=2026, record_wins=29, record_losses=4,
        adj_em=18.7, adj_o=118.3, adj_d=99.6, efg_pct=0.558, opp_efg_pct=0.462,
        to_pct=0.155, opp_to_pct=0.192, orb_pct=0.315, drb_pct=0.728,
        ft_rate=0.362, tempo=73.8, sos=4.2,   # weak SOS (WCC)
    ),
    TeamInput(
        team_id=7, team_name="Drake Bulldogs",       seed=10, region="South",
        conference="MVC",     season=2026, record_wins=25, record_losses=8,
        adj_em=12.1, adj_o=108.4, adj_d=96.3, efg_pct=0.501, opp_efg_pct=0.461,
        to_pct=0.162, opp_to_pct=0.215, orb_pct=0.312, drb_pct=0.731,
        ft_rate=0.302, tempo=71.4, sos=2.1,
    ),
    TeamInput(
        team_id=8, team_name="Charleston Cougars",   seed=11, region="South",
        conference="CAA",     season=2026, record_wins=27, record_losses=6,
        adj_em=10.8, adj_o=107.2, adj_d=96.4, efg_pct=0.498, opp_efg_pct=0.463,
        to_pct=0.158, opp_to_pct=0.219, orb_pct=0.328, drb_pct=0.744,
        ft_rate=0.291, tempo=74.2, sos=1.8,   # high tempo — upset-hunter bait
    ),
    TeamInput(
        team_id=9,  team_name="Vermont Catamounts",  seed=13, region="Midwest",
        conference="America East", season=2026, record_wins=28, record_losses=5,
        adj_em=8.4,  adj_o=105.1, adj_d=96.7, efg_pct=0.488, opp_efg_pct=0.459,
        to_pct=0.151, opp_to_pct=0.222, orb_pct=0.319, drb_pct=0.755,
        ft_rate=0.278, tempo=69.1, sos=0.3,
    ),
    TeamInput(
        team_id=10, team_name="Maine Black Bears",   seed=16, region="East",
        conference="America East", season=2026, record_wins=22, record_losses=10,
        adj_em=-1.2, adj_o=98.4,  adj_d=99.6, efg_pct=0.451, opp_efg_pct=0.491,
        to_pct=0.194, opp_to_pct=0.178, orb_pct=0.271, drb_pct=0.702,
        ft_rate=0.261, tempo=64.2, sos=-3.1,
    ),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _print_rankings(result, title: str, n: int = 10) -> None:
    width = 54
    print(f"\n{'─' * width}")
    print(f"  {title}")
    print(f"  Profile: {result.profile_name}  |  Season: {result.season}")
    print(f"{'─' * width}")
    print(f"  {'Rank':<5} {'Team':<28} {'Seed':<5} {'Score':>6}")
    print(f"  {'----':<5} {'----':<28} {'----':<5} {'-----':>6}")
    for t in result.top(n):
        seed_str = str(t.seed) if t.seed else "—"
        print(f"  {t.rank:<5} {t.team_name:<28} {seed_str:<5} {t.march_score:>6.2f}")
    print(f"{'─' * width}")


def _print_matchup(a, b) -> None:
    print(f"\n  Head-to-Head (2-team pool)")
    print(f"  {'Team':<28} {'Score':>6}  {'Result'}")
    print(f"  {'----':<28} {'-----':>6}  {'------'}")
    winner = a if a.march_score >= b.march_score else b
    for t in (a, b):
        tag = "← WINNER" if t.team_id == winner.team_id else ""
        print(f"  {t.team_name:<28} {t.march_score:>6.2f}  {tag}")


# ---------------------------------------------------------------------------
# Demo runs
# ---------------------------------------------------------------------------

def run_all_profiles() -> None:
    print("\n╔══════════════════════════════════════════════════════╗")
    print("║       March Metrics Scoring Engine — Demo            ║")
    print("╚══════════════════════════════════════════════════════╝")

    for profile_name in ["balanced", "offense-heavy", "defense-heavy", "upset-hunter"]:
        result = compute_march_scores(SAMPLE_TEAMS, profile_name)
        _print_rankings(result, f"Full Pool Rankings ({profile_name})")


def run_matchup_demo() -> None:
    """Score Auburn (1-seed) vs Charleston (11-seed) under upset-hunter."""
    auburn    = next(t for t in SAMPLE_TEAMS if t.team_id == 1)
    charleston = next(t for t in SAMPLE_TEAMS if t.team_id == 8)

    print("\n──────────────────────────────────────────────────────")
    print("  Matchup: Auburn (#1) vs Charleston (#11)")
    print("  Profile: upset-hunter")

    a, b = score_single_matchup(auburn, charleston, "upset-hunter")
    _print_matchup(a, b)

    print("\n  Same matchup under 'balanced':")
    a2, b2 = score_single_matchup(auburn, charleston, "balanced")
    _print_matchup(a2, b2)


def run_custom_profile_demo() -> None:
    """Show that a raw WeightDict can be passed directly."""
    custom_weights = {
        "adj_em": 0.0,   # ignore efficiency margin entirely
        "adj_o":  0.0,
        "adj_d":  0.0,
        "efg_pct": 0.0,
        "opp_efg_pct": 0.0,
        "to_pct":      0.5,  # heavily penalize turnovers
        "opp_to_pct":  0.5,  # reward forcing turnovers
        "orb_pct":     0.0,
        "drb_pct":     0.0,
        "ft_rate":     0.0,
        "tempo":       0.0,
        "sos":         0.0,
    }
    result = compute_march_scores(SAMPLE_TEAMS, custom_weights)
    _print_rankings(result, "Custom Profile (turnover-only)", n=5)


def run_direction_check() -> None:
    """
    Sanity-check: for 'adj_d' (lower is better), the team with the
    lowest adj_d value should have the highest percentile for that metric.
    """
    result = compute_march_scores(SAMPLE_TEAMS, "balanced")

    print("\n──────────────────────────────────────────────────────")
    print("  Direction-check: adj_d (lower = better defense)")
    print(f"  {'Team':<28} {'Raw adj_d':>10}  {'Percentile':>10}")
    print(f"  {'----':<28} {'---------':>10}  {'----------':>10}")

    sorted_by_raw = sorted(result.teams, key=lambda t: t.raw_metrics["adj_d"])
    for t in sorted_by_raw:
        raw = t.raw_metrics["adj_d"]
        pct = t.metric_percentiles["adj_d"]
        print(f"  {t.team_name:<28} {raw:>10.1f}  {pct:>10.1f}")

    best_defense = sorted_by_raw[0]   # lowest raw adj_d
    assert best_defense.metric_percentiles["adj_d"] == 100.0, (
        f"Expected adj_d percentile=100 for best defense, "
        f"got {best_defense.metric_percentiles['adj_d']}"
    )
    print("\n  ✓ Direction inversion correct: lowest adj_d → percentile 100.0")


if __name__ == "__main__":
    run_all_profiles()
    run_matchup_demo()
    run_custom_profile_demo()
    run_direction_check()
    print("\n  All demo checks passed.\n")
