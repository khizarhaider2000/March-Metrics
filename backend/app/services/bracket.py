"""
app/services/bracket.py

March Metrics Bracket Engine
==============================

Generates a fully simulated NCAA tournament bracket by advancing winners
round-by-round using the matchup engine.

Supports:
  • 68-team bracket  — 4 First Four games + 64-team main draw
  • 64-team bracket  — 4 regions × 16 seeds, 6 rounds (R64 → Championship)
  • 16-team bracket  — single region, 4 rounds (R16 → Championship)

All bracket sizes share the same generic single-elimination runner.

Seeding / bracket position
--------------------------
Standard NCAA first-round seeding for each region:

    Game 1 : 1  vs 16     Game 5 : 6  vs 11
    Game 2 : 8  vs  9     Game 6 : 3  vs 14
    Game 3 : 5  vs 12     Game 7 : 7  vs 10
    Game 4 : 4  vs 13     Game 8 : 2  vs 15

After round 1, winners keep their bracket positions.  Subsequent rounds
pair consecutive winners: winner[0] vs winner[1], winner[2] vs winner[3], …

Final Four matchups (standard NCAA)
    East champion   vs  West champion
    South champion  vs  Midwest champion

Public API
----------
    build_bracket(teams, profile, season) → BracketResult
"""

from __future__ import annotations

from typing import Union

from app.schemas.bracket import BracketGame, BracketResult, BracketRound, TeamInfo
from app.schemas.scoring import ScoredTeam, TeamInput
from app.services.matchup import analyze_matchup
from app.services.profiles import WeightDict


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# NCAA standard first-round seeding pairs (higher seed = lower number = better)
SEED_MATCHUPS_R1: list[tuple[int, int]] = [
    (1, 16), (8, 9), (5, 12), (4, 13),
    (6, 11), (3, 14), (7, 10), (2, 15),
]

# Processing order for the four regions
REGION_ORDER: list[str] = ["East", "West", "South", "Midwest"]

# Final Four pairings: which two regional champions meet
FINAL_FOUR_PAIRS: list[tuple[str, str]] = [
    ("East",  "West"),
    ("South", "Midwest"),
]

# Round labels indexed by round number
ROUND_NAMES_64: dict[int, str] = {
    0: "First Four",
    1: "Round of 64",
    2: "Round of 32",
    3: "Sweet Sixteen",
    4: "Elite Eight",
    5: "Final Four",
    6: "Championship",
}

ROUND_NAMES_16: dict[int, str] = {
    1: "First Round",
    2: "Quarterfinals",
    3: "Semifinals",
    4: "Championship",
}

# Actual First Four pairing order used for display and game IDs.
FIRST_FOUR_ORDER: list[tuple[str, int]] = [
    ("Midwest", 16),
    ("West", 11),
    ("South", 16),
    ("Midwest", 11),
]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _team_info(team: TeamInput | ScoredTeam) -> TeamInfo:
    """Convert a TeamInput or ScoredTeam to a lightweight TeamInfo."""
    return TeamInfo(
        team_id=team.team_id,
        team_name=team.team_name,
        seed=team.seed,
        region=team.region,
        conference=team.conference,
        record_wins=team.record_wins,
        record_losses=team.record_losses,
    )


def _seed_to_bracket_order(teams: list[TeamInput]) -> list[TeamInput]:
    """
    Re-order a list of seeded teams into their first-round bracket positions.

    Input:  16 TeamInput objects with .seed values 1–16
    Output: 32-length ordered list where index pairs (0,1), (2,3), …
            represent the 8 first-round matchups in bracket order.

    Example output order: [seed1, seed16, seed8, seed9, seed5, seed12, …]
    """
    by_seed: dict[int, TeamInput] = {t.seed: t for t in teams if t.seed is not None}
    ordered: list[TeamInput] = []
    for seed_a, seed_b in SEED_MATCHUPS_R1:
        ordered.append(by_seed[seed_a])
        ordered.append(by_seed[seed_b])
    return ordered


def _play_game(
    game_id: int,
    round_num: int,
    round_name: str,
    region: str | None,
    slot: int,
    team_a: TeamInput,
    team_b: TeamInput,
    profile: Union[str, WeightDict],
) -> tuple[BracketGame, TeamInput]:
    """
    Run one matchup and return a (BracketGame, winner_as_TeamInput) tuple.

    The returned TeamInput for the winner is the *original* TeamInput object
    (not a ScoredTeam) so it retains full metrics for subsequent rounds.
    """
    result = analyze_matchup(team_a, team_b, profile)

    # Identify which original input is the winner
    winner_input = team_a if result.winner.team_id == team_a.team_id else team_b

    # Flatten category edges to plain dicts for clean JSON output
    category_edges: list[dict] = [
        {
            "category":     e.category,
            "label":        e.label,
            "team_a_score": e.team_a_score,
            "team_b_score": e.team_b_score,
            "gap":          e.gap,
            "edge_strength": e.edge_strength,
            "winner_name":  e.winner_name,
        }
        for e in result.category_edges
    ]

    game = BracketGame(
        game_id=game_id,
        round_num=round_num,
        round_name=round_name,
        region=region,
        slot=slot,
        team_a=_team_info(team_a),
        team_b=_team_info(team_b),
        winner=_team_info(result.winner),
        loser=_team_info(result.loser),
        winner_march_score=result.winner.march_score,
        loser_march_score=result.loser.march_score,
        score_gap=result.score_gap,
        confidence=result.confidence,
        top_reasons=result.top_reasons,
        explanation=result.explanation,
        category_edges=category_edges,
    )

    return game, winner_input


def _run_single_elimination(
    region_name: str | None,
    bracket_ordered_teams: list[TeamInput],
    profile: Union[str, WeightDict],
    game_id: int,
    starting_round_num: int,
    round_names: dict[int, str],
) -> tuple[list[BracketRound], TeamInput, int]:
    """
    Run a complete single-elimination sub-bracket.

    Parameters
    ----------
    region_name
        Label used on each game (None for Final Four / Championship).
    bracket_ordered_teams
        Teams ordered by bracket position (pairs = first-round opponents).
        Length must be a power of 2.
    profile
        Weight profile (name or WeightDict).
    game_id
        Starting game_id counter.  Incremented and returned after all games.
    starting_round_num
        Round number for the first round played here.
    round_names
        Map of round_num → display label.

    Returns
    -------
    (rounds, champion_TeamInput, next_game_id)
        rounds        – list of BracketRound, one per round played
        champion      – TeamInput of the sub-bracket winner
        next_game_id  – game_id to use for subsequent games
    """
    rounds: list[BracketRound] = []
    current_teams = bracket_ordered_teams
    round_num = starting_round_num

    while len(current_teams) > 1:
        games: list[BracketGame] = []
        next_teams: list[TeamInput] = []
        round_name = round_names.get(round_num, f"Round {round_num}")

        for slot, i in enumerate(range(0, len(current_teams), 2), start=1):
            team_a = current_teams[i]
            team_b = current_teams[i + 1]

            game, winner = _play_game(
                game_id=game_id,
                round_num=round_num,
                round_name=round_name,
                region=region_name,
                slot=slot,
                team_a=team_a,
                team_b=team_b,
                profile=profile,
            )

            games.append(game)
            next_teams.append(winner)
            game_id += 1

        rounds.append(BracketRound(
            round_num=round_num,
            round_name=round_name,
            games=games,
        ))

        current_teams = next_teams
        round_num += 1

    champion = current_teams[0]
    return rounds, champion, game_id


def _merge_into_rounds(
    accumulated: dict[int, list[BracketGame]],
    new_rounds: list[BracketRound],
) -> None:
    """Merge a list of BracketRound objects into an accumulated dict in place."""
    for rnd in new_rounds:
        if rnd.round_num not in accumulated:
            accumulated[rnd.round_num] = []
        accumulated[rnd.round_num].extend(rnd.games)


def _resolve_first_four(
    region_map: dict[str, list[TeamInput]],
    profile: Union[str, WeightDict],
    game_id: int,
) -> tuple[list[BracketRound], dict[str, list[TeamInput]], int]:
    """Resolve duplicated seed lines into a 64-team field."""
    duplicated_slots: dict[tuple[str, int], list[TeamInput]] = {}
    for region, teams in region_map.items():
        seeds: dict[int, list[TeamInput]] = {}
        for team in teams:
            if team.seed is None:
                raise ValueError(f"Team '{team.team_name}' is missing a seed.")
            seeds.setdefault(team.seed, []).append(team)
        for seed, slot_teams in seeds.items():
            if len(slot_teams) > 2:
                raise ValueError(
                    f"Region '{region}' seed {seed} has {len(slot_teams)} teams; at most 2 allowed."
                )
            if len(slot_teams) == 2:
                duplicated_slots[(region, seed)] = slot_teams

    unexpected = sorted(set(duplicated_slots) - set(FIRST_FOUR_ORDER))
    if unexpected:
        raise ValueError(
            f"Unsupported play-in slots found: {unexpected}. "
            f"Expected only {FIRST_FOUR_ORDER}."
        )

    first_four_games: list[BracketGame] = []
    resolved_map = {region: list(teams) for region, teams in region_map.items()}

    for slot_num, (region, seed) in enumerate(FIRST_FOUR_ORDER, start=1):
        slot_teams = duplicated_slots.get((region, seed))
        if not slot_teams:
            continue

        game, winner = _play_game(
            game_id=game_id,
            round_num=0,
            round_name=ROUND_NAMES_64[0],
            region=region,
            slot=slot_num,
            team_a=slot_teams[0],
            team_b=slot_teams[1],
            profile=profile,
        )
        first_four_games.append(game)
        game_id += 1

        resolved_map[region] = [
            team
            for team in resolved_map[region]
            if team.team_id not in {slot_teams[0].team_id, slot_teams[1].team_id}
        ]
        resolved_map[region].append(winner)

    rounds = []
    if first_four_games:
        rounds.append(BracketRound(
            round_num=0,
            round_name=ROUND_NAMES_64[0],
            games=first_four_games,
        ))

    return rounds, resolved_map, game_id


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_bracket(
    teams: list[TeamInput],
    profile: Union[str, WeightDict],
    season: int,
) -> BracketResult:
    """
    Simulate a full NCAA tournament bracket and return the result.

    Parameters
    ----------
    teams
        All tournament teams. Must be 16, 64, or 68 teams.

        For 64/68-team mode: each team must have .region set to one of
        ["East", "West", "South", "Midwest"] and .seed set to 1–16.
        In 68-team mode, the four First Four slots are represented by duplicate
        seed lines in their assigned regions.

        For 16-team mode: teams are treated as a single region.
        Seeds must be 1–16.

    profile
        Built-in profile name string (e.g. "balanced") or a WeightDict.

    season
        Tournament season year (used for display only).

    Returns
    -------
    BracketResult
        Complete bracket with every round, every game, and the champion.
        Call .to_dict() for JSON-ready output.
    """
    n = len(teams)
    if n not in (16, 64, 68):
        raise ValueError(f"build_bracket requires 16, 64, or 68 teams, got {n}.")

    profile_name = profile if isinstance(profile, str) else "custom"

    # ── 16-team bracket ────────────────────────────────────────────────────
    if n == 16:
        seeded = _seed_to_bracket_order(sorted(teams, key=lambda t: t.seed or 99))
        rounds, champion_input, _ = _run_single_elimination(
            region_name=None,
            bracket_ordered_teams=seeded,
            profile=profile,
            game_id=1,
            starting_round_num=1,
            round_names=ROUND_NAMES_16,
        )
        return BracketResult(
            profile_name=profile_name,
            season=season,
            bracket_size=16,
            rounds=rounds,
            champion=_team_info(champion_input),
        )

    # ── 64/68-team bracket ────────────────────────────────────────────────
    # Step 1: validate and group teams by region
    region_map: dict[str, list[TeamInput]] = {r: [] for r in REGION_ORDER}
    for team in teams:
        if team.region not in region_map:
            raise ValueError(
                f"Team '{team.team_name}' has unknown region '{team.region}'. "
                f"Expected one of: {REGION_ORDER}"
            )
        region_map[team.region].append(team)

    for region, r_teams in region_map.items():
        if len(r_teams) < 16 or len(r_teams) > 18:
            raise ValueError(
                f"Region '{region}' has {len(r_teams)} teams; expected between 16 and 18."
            )

    # Step 2: resolve First Four, if present
    accumulated_games: dict[int, list[BracketGame]] = {}
    regional_champions: dict[str, TeamInput] = {}
    game_id = 1

    first_four_rounds, resolved_region_map, game_id = _resolve_first_four(
        region_map=region_map,
        profile=profile,
        game_id=game_id,
    )
    _merge_into_rounds(accumulated_games, first_four_rounds)

    for region, r_teams in resolved_region_map.items():
        seeds = sorted(team.seed for team in r_teams if team.seed is not None)
        if len(r_teams) != 16 or seeds != list(range(1, 17)):
            raise ValueError(
                f"Region '{region}' does not resolve to a valid 16-team bracket."
            )

    # Step 3: run all four regional sub-brackets (rounds 1–4)
    for region_name in REGION_ORDER:
        seeded = _seed_to_bracket_order(resolved_region_map[region_name])
        r_rounds, champion_input, game_id = _run_single_elimination(
            region_name=region_name,
            bracket_ordered_teams=seeded,
            profile=profile,
            game_id=game_id,
            starting_round_num=1,
            round_names=ROUND_NAMES_64,
        )
        regional_champions[region_name] = champion_input
        _merge_into_rounds(accumulated_games, r_rounds)

    # Step 4: Final Four + Championship (rounds 5–6)
    # Pair regional champions according to FINAL_FOUR_PAIRS and flatten
    # into bracket order: [EastChamp, WestChamp, SouthChamp, MidwestChamp]
    f4_teams: list[TeamInput] = []
    for region_a, region_b in FINAL_FOUR_PAIRS:
        f4_teams.append(regional_champions[region_a])
        f4_teams.append(regional_champions[region_b])

    f4_rounds, champion_input, _ = _run_single_elimination(
        region_name=None,
        bracket_ordered_teams=f4_teams,
        profile=profile,
        game_id=game_id,
        starting_round_num=5,
        round_names=ROUND_NAMES_64,
    )
    _merge_into_rounds(accumulated_games, f4_rounds)

    # Step 5: assemble final BracketResult
    rounds = [
        BracketRound(
            round_num=rn,
            round_name=ROUND_NAMES_64.get(rn, f"Round {rn}"),
            games=accumulated_games[rn],
        )
        for rn in sorted(accumulated_games.keys())
    ]

    return BracketResult(
        profile_name=profile_name,
        season=season,
        bracket_size=n,
        rounds=rounds,
        champion=_team_info(champion_input),
    )
