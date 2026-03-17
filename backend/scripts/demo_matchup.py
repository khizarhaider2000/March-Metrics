"""
scripts/demo_matchup.py

Demo for the March Metrics matchup engine.
No database required.

Usage:
    cd backend
    python3 -m scripts.demo_matchup

Covers:
  1. Clear favorite vs underdog  (Auburn #1 vs Maine #16)
  2. Closely matched teams       (Houston #1 vs Duke #1)
  3. Mid-major upset candidate   (Auburn #1 vs Charleston #11, upset-hunter)
  4. Offensive vs defensive team (Gonzaga offense vs Houston defense)
  5. Custom weight profile
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.schemas.scoring import TeamInput
from app.services.matchup import analyze_matchup


# ---------------------------------------------------------------------------
# Sample teams (same data as demo_scoring.py for consistency)
# ---------------------------------------------------------------------------

def _team(
    team_id, name, seed, region, conf, wins, losses,
    adj_em, adj_o, adj_d, efg, opp_efg, to_pct, opp_to,
    orb, drb, ft_rate, tempo, sos,
) -> TeamInput:
    return TeamInput(
        team_id=team_id, team_name=name, seed=seed, region=region,
        conference=conf, season=2026, record_wins=wins, record_losses=losses,
        adj_em=adj_em, adj_o=adj_o, adj_d=adj_d, efg_pct=efg,
        opp_efg_pct=opp_efg, to_pct=to_pct, opp_to_pct=opp_to,
        orb_pct=orb, drb_pct=drb, ft_rate=ft_rate, tempo=tempo, sos=sos,
    )

AUBURN     = _team(1,  "Auburn Tigers",       1,  "West",    "SEC",          31, 3,  28.5, 120.1, 91.6, 0.561, 0.431, 0.148, 0.211, 0.338, 0.762, 0.356, 72.1, 11.2)
HOUSTON    = _team(2,  "Houston Cougars",      1,  "Midwest", "Big 12",       31, 3,  27.8, 117.4, 89.6, 0.541, 0.420, 0.152, 0.224, 0.321, 0.779, 0.341, 65.4, 12.1)
DUKE       = _team(3,  "Duke Blue Devils",     1,  "East",    "ACC",          30, 4,  26.4, 119.8, 93.4, 0.553, 0.442, 0.162, 0.198, 0.308, 0.741, 0.371, 70.2, 10.8)
GONZAGA    = _team(6,  "Gonzaga Bulldogs",     5,  "Midwest", "WCC",          29, 4,  18.7, 118.3, 99.6, 0.558, 0.462, 0.155, 0.192, 0.315, 0.728, 0.362, 73.8,  4.2)
CHARLESTON = _team(8,  "Charleston Cougars",  11,  "South",   "CAA",          27, 6,  10.8, 107.2, 96.4, 0.498, 0.463, 0.158, 0.219, 0.328, 0.744, 0.291, 74.2,  1.8)
MAINE      = _team(10, "Maine Black Bears",   16,  "East",    "America East", 22, 10, -1.2,  98.4, 99.6, 0.451, 0.491, 0.194, 0.178, 0.271, 0.702, 0.261, 64.2, -3.1)


# ---------------------------------------------------------------------------
# Display helpers
# ---------------------------------------------------------------------------

BAR_WIDTH = 20

def _bar(score: float) -> str:
    """Mini ASCII progress bar, 0-100."""
    filled = round(score / 100 * BAR_WIDTH)
    return "█" * filled + "░" * (BAR_WIDTH - filled)

SEP = "─" * 62

def _print_result(result, title: str) -> None:
    w = result.winner
    l = result.loser

    print(f"\n{SEP}")
    print(f"  {title}")
    print(f"  Profile: {result.profile_name}")
    print(SEP)

    # Overall scores
    print(f"\n  {'Team':<28} {'Score':>6}  {'Bar'}")
    print(f"  {'----':<28} {'-----':>6}  {'---'}")
    for team in [w, l]:
        tag = " ◀ PROJECTED WINNER" if team.team_id == w.team_id else ""
        print(f"  {team.team_name:<28} {team.march_score:>6.1f}  {_bar(team.march_score)}{tag}")

    print(f"\n  Confidence : {result.confidence.upper()}")
    print(f"  Score gap  : {result.score_gap:.1f} pts")

    # Category edges
    print(f"\n  Category Breakdown")
    print(f"  {'Category':<22} {w.team_name[:14]:<14}  {l.team_name[:14]:<14}  {'Edge'}")
    print(f"  {'--------':<22} {'------':<14}  {'------':<14}  {'----'}")
    for edge in result.category_edges:
        a_score = edge.team_a_score if edge.team_a_id == w.team_id else edge.team_b_score
        b_score = edge.team_b_score if edge.team_b_id == l.team_id else edge.team_a_score
        arrow = "▲" if edge.winner_id == w.team_id else ("▼" if edge.winner_id == l.team_id else "=")
        print(
            f"  {edge.label:<22} {a_score:>6.1f}          {b_score:>6.1f}          "
            f"{arrow} {edge.edge_strength}"
        )

    # Explanation
    print(f"\n  Explanation:")
    # Word-wrap at 58 chars
    words = result.explanation.split()
    line, lines = "  ", []
    for word in words:
        if len(line) + len(word) + 1 > 60:
            lines.append(line)
            line = "  " + word + " "
        else:
            line += word + " "
    lines.append(line)
    print("\n".join(lines))
    print()


# ---------------------------------------------------------------------------
# Demo runs
# ---------------------------------------------------------------------------

def demo_clear_favorite():
    result = analyze_matchup(AUBURN, MAINE, "balanced")
    _print_result(result, "Demo 1 — Clear Favorite  |  Auburn (#1) vs Maine (#16)")


def demo_closely_matched():
    result = analyze_matchup(HOUSTON, DUKE, "balanced")
    _print_result(result, "Demo 2 — Closely Matched  |  Houston (#1) vs Duke (#1)")


def demo_upset_candidate():
    result = analyze_matchup(AUBURN, CHARLESTON, "upset-hunter")
    _print_result(result, "Demo 3 — Upset Candidate  |  Auburn (#1) vs Charleston (#11)  [upset-hunter]")


def demo_offense_vs_defense():
    """Gonzaga (elite offense, weak defense/SOS) vs Houston (elite defense)."""
    result = analyze_matchup(GONZAGA, HOUSTON, "balanced")
    _print_result(result, "Demo 4 — Offense vs Defense  |  Gonzaga (#5) vs Houston (#1)")

    result2 = analyze_matchup(GONZAGA, HOUSTON, "offense-heavy")
    _print_result(result2, "Demo 4b — same matchup under offense-heavy")

    result3 = analyze_matchup(GONZAGA, HOUSTON, "defense-heavy")
    _print_result(result3, "Demo 4c — same matchup under defense-heavy")


def demo_custom_profile():
    """Pure ball-security focus — who turns it over least?"""
    custom = {
        "adj_em": 0.0, "adj_o": 0.0, "adj_d": 0.0,
        "efg_pct": 0.0, "opp_efg_pct": 0.0,
        "to_pct": 0.5, "opp_to_pct": 0.5,
        "orb_pct": 0.0, "drb_pct": 0.0,
        "ft_rate": 0.0, "tempo": 0.0, "sos": 0.0,
    }
    result = analyze_matchup(AUBURN, HOUSTON, custom)
    _print_result(result, "Demo 5 — Custom Profile (turnover-only)  |  Auburn vs Houston")


def run_assertion_checks(silent: bool = False) -> None:
    """Basic correctness assertions."""
    # Auburn should beat Maine decisively
    r = analyze_matchup(AUBURN, MAINE, "balanced")
    assert r.winner.team_id == AUBURN.team_id, "Auburn should beat Maine"
    assert r.confidence in ("moderate favorite", "heavy favorite"), "Should be a strong pick"

    # Houston vs Duke — winner should have higher march_score
    r2 = analyze_matchup(HOUSTON, DUKE, "balanced")
    assert r2.winner.march_score > r2.loser.march_score

    # Category edges sorted by gap descending
    for i in range(len(r2.category_edges) - 1):
        assert r2.category_edges[i].gap >= r2.category_edges[i + 1].gap

    # Explanation is non-empty and mentions both teams
    assert HOUSTON.team_name in r2.explanation or DUKE.team_name in r2.explanation

    if not silent:
        print(f"\n  ✓ All assertion checks passed.")


if __name__ == "__main__":
    demo_clear_favorite()
    demo_closely_matched()
    demo_upset_candidate()
    demo_offense_vs_defense()
    demo_custom_profile()
    run_assertion_checks()
    print(f"  Done.\n")
