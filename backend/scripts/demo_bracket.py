"""
scripts/demo_bracket.py

Full bracket simulation demo for March Metrics.
No database required — builds TeamInput objects from the same
mock data used by seed_season.py.

Usage:
    cd backend
    python3 -m scripts.demo_bracket

Runs:
  1. Full 64-team bracket under all 4 built-in profiles
  2. Compact round-by-round summary for each
  3. Champion's path to the title (every win + explanation)
  4. Upset report — all games where a higher seed beat a lower seed
  5. Lightweight JSON output sample (first round, 2 games)
  6. 16-team bracket demo (single region)
  7. Assertion checks
"""

import sys
import os
import json
import random

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.schemas.scoring import TeamInput
from app.services.bracket import build_bracket

random.seed(42)

# ---------------------------------------------------------------------------
# Reproduce the mock 2026 field from seed_season.py
# ---------------------------------------------------------------------------

_MOCK_FIELD = [
    # (team_name, conference, wins, losses, seed, region)
    ("Duke Blue Devils",          "ACC",          30,  4, 1,  "East"),
    ("Tennessee Volunteers",      "SEC",          28,  5, 2,  "East"),
    ("Iowa State Cyclones",       "Big 12",       27,  6, 3,  "East"),
    ("Texas A&M Aggies",          "SEC",          26,  7, 4,  "East"),
    ("Michigan Wolverines",       "Big Ten",      24,  9, 5,  "East"),
    ("Ole Miss Rebels",           "SEC",          23, 10, 6,  "East"),
    ("Dayton Flyers",             "Atlantic 10",  25,  8, 7,  "East"),
    ("Mississippi State",         "SEC",          22, 11, 8,  "East"),
    ("Boise State Broncos",       "Mountain West",21, 12, 9,  "East"),
    ("Colorado State Rams",       "Mountain West",20, 13,10,  "East"),
    ("VCU Rams",                  "Atlantic 10",  24,  9,11,  "East"),
    ("UAB Blazers",               "American",     22, 11,12,  "East"),
    ("Colgate Raiders",           "Patriot",      26,  6,13,  "East"),
    ("Lipscomb Bisons",           "ASUN",         25,  8,14,  "East"),
    ("Montana Grizzlies",         "Big Sky",      27,  5,15,  "East"),
    ("Maine Black Bears",         "America East", 22, 10,16,  "East"),

    ("Auburn Tigers",             "SEC",          31,  3, 1,  "West"),
    ("Florida Gators",            "SEC",          27,  6, 2,  "West"),
    ("Wisconsin Badgers",         "Big Ten",      26,  7, 3,  "West"),
    ("Baylor Bears",              "Big 12",       25,  8, 4,  "West"),
    ("UCLA Bruins",               "Big Ten",      24,  9, 5,  "West"),
    ("Kansas State Wildcats",     "Big 12",       23, 10, 6,  "West"),
    ("Xavier Musketeers",         "Big East",     22, 11, 7,  "West"),
    ("Oklahoma Sooners",          "SEC",          21, 12, 8,  "West"),
    ("Nevada Wolf Pack",          "Mountain West",23,  9, 9,  "West"),
    ("New Mexico Lobos",          "Mountain West",22, 10,10,  "West"),
    ("San Francisco Dons",        "WCC",          24,  8,11,  "West"),
    ("Oral Roberts",              "Summit",       26,  6,12,  "West"),
    ("Louisiana Lafayette",       "Sun Belt",     25,  8,13,  "West"),
    ("Northern Kentucky Norse",   "Horizon",      23, 10,14,  "West"),
    ("Longwood Lancers",          "Big South",    26,  7,15,  "West"),
    ("Alabama A&M Bulldogs",      "SWAC",         20, 13,16,  "West"),

    ("Kansas Jayhawks",           "Big 12",       30,  4, 1,  "South"),
    ("Marquette Golden Eagles",   "Big East",     28,  5, 2,  "South"),
    ("Purdue Boilermakers",       "Big Ten",      27,  6, 3,  "South"),
    ("Arizona Wildcats",          "Big 12",       26,  7, 4,  "South"),
    ("Clemson Tigers",            "ACC",          24,  9, 5,  "South"),
    ("Illinois Fighting Illini",  "Big Ten",      23, 10, 6,  "South"),
    ("Texas Longhorns",           "SEC",          22, 11, 7,  "South"),
    ("Mississippi Valley State",  "SWAC",         20, 13, 8,  "South"),
    ("Utah State Aggies",         "Mountain West",23,  9, 9,  "South"),
    ("Drake Bulldogs",            "MVC",          25,  8,10,  "South"),
    ("Charleston Cougars",        "CAA",          27,  6,11,  "South"),
    ("Akron Zips",                "MAC",          24,  9,12,  "South"),
    ("Furman Paladins",           "SoCon",        26,  6,13,  "South"),
    ("UCSB Gauchos",              "Big West",     24,  9,14,  "South"),
    ("Southeast Missouri State",  "OVC",          23, 10,15,  "South"),
    ("Grambling State Tigers",    "SWAC",         21, 12,16,  "South"),

    ("Houston Cougars",           "Big 12",       31,  3, 1,  "Midwest"),
    ("Alabama Crimson Tide",      "SEC",          28,  5, 2,  "Midwest"),
    ("Kentucky Wildcats",         "SEC",          27,  6, 3,  "Midwest"),
    ("Indiana Hoosiers",          "Big Ten",      25,  8, 4,  "Midwest"),
    ("Gonzaga Bulldogs",          "WCC",          29,  4, 5,  "Midwest"),
    ("TCU Horned Frogs",          "Big 12",       23, 10, 6,  "Midwest"),
    ("Florida State Seminoles",   "ACC",          22, 11, 7,  "Midwest"),
    ("Maryland Terrapins",        "Big Ten",      21, 12, 8,  "Midwest"),
    ("Georgia Tech Yellow Jackets","ACC",         22, 11, 9,  "Midwest"),
    ("Penn State Nittany Lions",  "Big Ten",      21, 12,10,  "Midwest"),
    ("Pittsburgh Panthers",       "ACC",          23, 10,11,  "Midwest"),
    ("Liberty Flames",            "CUSA",         27,  6,12,  "Midwest"),
    ("Vermont Catamounts",        "America East", 28,  5,13,  "Midwest"),
    ("UNCW Seahawks",             "CAA",          25,  8,14,  "Midwest"),
    ("Winthrop Eagles",           "Big South",    24,  9,15,  "Midwest"),
    ("Alcorn State Braves",       "SWAC",         19, 14,16,  "Midwest"),
]


def _metrics_for_seed(seed: int) -> dict:
    """Plausible but fake metrics correlated with seed. Matches seed_season.py."""
    base_em = max(35.0 - seed * 2.0 + random.uniform(-1.5, 1.5), -5.0)
    adj_o   = 115.0 - seed * 0.8 + random.uniform(-2, 2)
    adj_d   = 90.0  + seed * 0.7 + random.uniform(-2, 2)
    return {
        "adj_em":      round(base_em, 1),
        "adj_o":       round(adj_o, 1),
        "adj_d":       round(adj_d, 1),
        "efg_pct":     round(0.55 - seed * 0.005 + random.uniform(-0.02, 0.02), 3),
        "opp_efg_pct": round(0.44 + seed * 0.004 + random.uniform(-0.02, 0.02), 3),
        "to_pct":      round(0.17 + random.uniform(-0.02, 0.02), 3),
        "opp_to_pct":  round(0.19 + random.uniform(-0.02, 0.02), 3),
        "orb_pct":     round(0.30 + random.uniform(-0.03, 0.03), 3),
        "drb_pct":     round(0.72 + random.uniform(-0.03, 0.03), 3),
        "ft_rate":     round(0.32 + random.uniform(-0.04, 0.04), 3),
        "tempo":       round(68.0 + random.uniform(-4, 4), 1),
        "sos":         round(base_em * 0.3 + random.uniform(-1, 1), 2),
    }


def build_mock_teams() -> list[TeamInput]:
    """Construct 64 TeamInput objects from the mock field."""
    teams = []
    for idx, (name, conf, wins, losses, seed, region) in enumerate(_MOCK_FIELD, start=1):
        m = _metrics_for_seed(seed)
        teams.append(TeamInput(
            team_id=idx, team_name=name, seed=seed, region=region,
            conference=conf, season=2026, record_wins=wins, record_losses=losses,
            **m,
        ))
    return teams


# ---------------------------------------------------------------------------
# Display helpers
# ---------------------------------------------------------------------------

SEP  = "─" * 66
SEP2 = "═" * 66
CONF_ICONS = {
    "toss-up":           "≈",
    "slight favorite":   "›",
    "moderate favorite": "»",
    "heavy favorite":    "»»",
}


def _conf_icon(confidence: str | None) -> str:
    return CONF_ICONS.get(confidence or "", "?")


def _print_bracket_summary(result, verbose: bool = False) -> None:
    print(f"\n{SEP2}")
    print(f"  2026 NCAA TOURNAMENT — {result.profile_name.upper()} PROFILE")
    print(f"  Bracket size: {result.bracket_size} teams")
    print(SEP2)

    for rnd in result.rounds:
        print(f"\n  ┌─ {rnd.round_name.upper()} ({len(rnd.games)} games)")
        region_groups: dict[str | None, list] = {}
        for g in rnd.games:
            region_groups.setdefault(g.region, []).append(g)

        for region, games in region_groups.items():
            if region:
                print(f"  │  [{region}]")
            for g in games:
                if not g.winner or not g.team_a or not g.team_b:
                    continue
                icon = _conf_icon(g.confidence)
                a_seed = f"#{g.team_a.seed}" if g.team_a.seed else "  "
                b_seed = f"#{g.team_b.seed}" if g.team_b.seed else "  "
                winner_mark = "✓"
                a_mark = winner_mark if g.winner.team_id == g.team_a.team_id else " "
                b_mark = winner_mark if g.winner.team_id == g.team_b.team_id else " "
                print(
                    f"  │  {a_seed:<3} {g.team_a.team_name:<26} {a_mark}  "
                    f"{icon}  "
                    f"{b_seed:<3} {g.team_b.team_name:<26} {b_mark}  "
                    f"gap={g.score_gap:.0f}"
                )
                if verbose and g.explanation:
                    # Wrap explanation to 60 chars
                    words = g.explanation.split()
                    line = "  │     ↳ "
                    for word in words:
                        if len(line) + len(word) > 66:
                            print(line)
                            line = "  │       " + word + " "
                        else:
                            line += word + " "
                    print(line)

    # Upsets
    upsets = result.all_upsets()
    if upsets:
        print(f"\n  ┌─ UPSETS ({len(upsets)} total)")
        for g in upsets:
            print(
                f"  │  #{g.winner.seed} {g.winner.team_name:<26} "
                f"over  #{g.loser.seed} {g.loser.team_name:<26}  "
                f"[{g.round_name}]"
            )

    print(f"\n  🏆  CHAMPION: {result.champion.team_name}  "
          f"(#{result.champion.seed} {result.champion.region or ''})")
    print(SEP2)


def _print_champion_path(result) -> None:
    path = result.champion_path()
    champ = result.champion
    print(f"\n{SEP}")
    print(f"  {champ.team_name}'s Path to the Championship")
    print(f"  Profile: {result.profile_name}")
    print(SEP)
    for game in path:
        opponent = game.loser
        print(
            f"  {game.round_name:<18}  "
            f"def. #{opponent.seed} {opponent.team_name:<26}  "
            f"score {game.winner_march_score:.1f}–{game.loser_march_score:.1f}  "
            f"({game.confidence})"
        )
        if game.top_reasons:
            print(f"  {'':18}  ↳ {', '.join(game.top_reasons[:2])}")
    print(SEP)


def _print_json_sample(result) -> None:
    """Print the first two games of round 1 as formatted JSON."""
    r1 = result.get_round(1)
    if not r1:
        return
    sample_games = r1.games[:2]

    # Extract just these game dicts from the full bracket dict
    full_dict = result.to_dict()
    r1_dict = next(r for r in full_dict["rounds"] if r["round_num"] == 1)
    sample = {
        "profile_name": full_dict["profile_name"],
        "season":        full_dict["season"],
        "bracket_size":  full_dict["bracket_size"],
        "round_sample": {
            "round_num":  r1_dict["round_num"],
            "round_name": r1_dict["round_name"],
            "games":      r1_dict["games"][:2],
        }
    }
    print(f"\n{SEP}")
    print("  JSON output sample (round 1, first 2 games):")
    print(SEP)
    print(json.dumps(sample, indent=2)[:2200])
    if len(json.dumps(sample)) > 2200:
        print("  … (truncated)")
    print(SEP)


# ---------------------------------------------------------------------------
# Demo runs
# ---------------------------------------------------------------------------

def run_all_profiles(teams: list[TeamInput]) -> dict[str, object]:
    results = {}
    for profile in ["balanced", "offense-heavy", "defense-heavy", "upset-hunter"]:
        print(f"\n  Running '{profile}' bracket …", end=" ", flush=True)
        result = build_bracket(teams, profile, season=2026)
        results[profile] = result
        print(f"Champion: {result.champion.team_name} (#{result.champion.seed} {result.champion.region})")
    return results


def run_verbose_bracket(teams: list[TeamInput], profile: str = "balanced") -> object:
    result = build_bracket(teams, profile, season=2026)
    _print_bracket_summary(result, verbose=False)
    _print_champion_path(result)
    return result


def run_upset_hunter_comparison(
    balanced_result,
    upset_result,
) -> None:
    b_upsets = balanced_result.all_upsets()
    u_upsets = upset_result.all_upsets()
    print(f"\n{SEP}")
    print("  Upset comparison: balanced vs upset-hunter")
    print(SEP)
    print(f"  balanced      upsets: {len(b_upsets)}")
    print(f"  upset-hunter  upsets: {len(u_upsets)}")
    print(f"\n  Upsets unique to upset-hunter:")
    b_upset_ids = {(g.winner.team_id, g.round_num) for g in b_upsets}
    for g in u_upsets:
        if (g.winner.team_id, g.round_num) not in b_upset_ids:
            print(f"    #{g.winner.seed} {g.winner.team_name:<26} "
                  f"over #{g.loser.seed} {g.loser.team_name}  [{g.round_name}]")
    print(SEP)


def run_16_team_demo() -> None:
    """Extract just the East region (16 teams) for a quick single-region bracket."""
    all_teams = build_mock_teams()
    east_teams = [t for t in all_teams if t.region == "East"]
    result = build_bracket(east_teams, "balanced", season=2026)
    print(f"\n{SEP}")
    print("  16-team bracket (East region only, balanced)")
    print(SEP)
    for rnd in result.rounds:
        print(f"\n  {rnd.round_name}:")
        for g in rnd.games:
            if g.winner and g.team_a and g.team_b:
                icon = _conf_icon(g.confidence)
                print(
                    f"    #{g.team_a.seed} {g.team_a.team_name:<26} "
                    f"{icon}  "
                    f"#{g.team_b.seed} {g.team_b.team_name:<26}  "
                    f"→ {g.winner.team_name}"
                )
    print(f"\n  Champion: {result.champion.team_name}")
    print(SEP)


def run_assertion_checks(results: dict) -> None:
    balanced = results["balanced"]

    # Champion must be a real team
    assert balanced.champion is not None, "No champion produced"

    # Correct number of games: 63 total for 64-team bracket
    total_games = sum(len(r.games) for r in balanced.rounds)
    assert total_games == 63, f"Expected 63 games, got {total_games}"

    # Correct number of rounds: 6
    assert len(balanced.rounds) == 6, f"Expected 6 rounds, got {len(balanced.rounds)}"

    # Round game counts: 32, 16, 8, 4, 2, 1
    expected_counts = [32, 16, 8, 4, 2, 1]
    for rnd, expected in zip(balanced.rounds, expected_counts):
        assert len(rnd.games) == expected, (
            f"Round {rnd.round_num} should have {expected} games, got {len(rnd.games)}"
        )

    # Champion path has exactly 6 wins
    path = balanced.champion_path()
    assert len(path) == 6, f"Champion should have 6 wins, got {len(path)}"

    # Champion appears as winner in every path game
    for game in path:
        assert game.winner.team_id == balanced.champion.team_id

    # to_dict() produces a dict (JSON-ready)
    d = balanced.to_dict()
    assert isinstance(d, dict)
    assert "rounds" in d and "champion" in d
    assert len(d["rounds"]) == 6

    # All four profiles produce a champion
    for name, result in results.items():
        assert result.champion is not None, f"No champion for profile '{name}'"

    print(f"\n  ✓ All assertion checks passed.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    teams = build_mock_teams()

    print(f"\n{'═'*66}")
    print("  March Metrics — Bracket Engine Demo")
    print(f"  {len(teams)} teams  |  season 2026")
    print(f"{'═'*66}")

    # Run all four profiles (champion summary only)
    print("\n  Champions by profile:")
    results = run_all_profiles(teams)

    # Full verbose bracket for "balanced"
    balanced_result = run_verbose_bracket(teams, "balanced")

    # JSON sample output
    _print_json_sample(balanced_result)

    # Upset comparison
    run_upset_hunter_comparison(results["balanced"], results["upset-hunter"])

    # 16-team bracket
    run_16_team_demo()

    # Assertions
    run_assertion_checks(results)
    print()
