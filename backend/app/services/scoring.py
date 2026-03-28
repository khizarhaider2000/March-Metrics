"""
app/services/scoring.py

March Metrics Scoring Engine
=============================

Converts raw team metrics into a single "March Score" (0–100) using a
user-selected weight profile.

Algorithm (three steps)
-----------------------
1. **Impute** — replace any None metric with the pool median for that metric.
   Avoids penalizing teams with missing data.

2. **Normalize → Percentile Rank** — for each metric, each team receives a
   percentile rank in [0, 100] relative to the entire pool:

       percentile = (# of teams with a strictly lower value) / (n - 1) × 100

   For "lower is better" metrics (adj_d, opp_efg_pct, to_pct) the percentile
   is then *inverted*: ``100 − percentile``.  This means 100 always = best.

   Edge cases:
   • Pool of 1 team → all percentiles = 50.0 (neutral)
   • All teams tied on a metric → all percentiles = 50.0

3. **Weighted Sum** — the March Score is the dot-product of the team's
   percentile vector with the weight vector, after normalizing weights to
   sum to 1.0:

       march_score = Σ (normalized_weight_i × percentile_i)

   Because percentiles are in [0, 100] and weights sum to 1.0, the result
   is always in [0, 100].

Public API
----------
    compute_march_scores(teams, profile_name_or_weights) → RankingsResult
    score_single_team(team, all_percentiles, weights)     → float
"""

from __future__ import annotations

from typing import Union

from app.schemas.scoring import RankingsResult, ScoredTeam, TeamInput
from app.services.profiles import (
    METRIC_DIRECTION,
    METRIC_FIELDS,
    SEED_UPSET_COMPRESSION,
    WeightDict,
    get_effective_weights,
    get_profile_weights,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _collect_values(teams: list[TeamInput], metric: str) -> list[float]:
    """Return all non-None values for *metric* across the team pool."""
    return [
        v for t in teams
        if (v := getattr(t, metric)) is not None
    ]


def _median(values: list[float]) -> float:
    """Simple median — no external dependencies."""
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2.0


def _percentile_rank(value: float, all_values: list[float]) -> float:
    """
    Compute the percentile rank of *value* within *all_values*.

    Returns a float in [0.0, 100.0].
    0.0  → lowest value in the pool.
    100.0 → highest value in the pool.

    Formula:
        percentile = count(v < value) / (n - 1) × 100

    When n == 1 or all values are identical the result is 50.0 (neutral).
    """
    n = len(all_values)
    if n <= 1:
        return 50.0

    count_below = sum(1 for v in all_values if v < value)
    raw = count_below / (n - 1) * 100.0

    # Clamp to [0, 100] to guard against floating-point edge cases
    return max(0.0, min(100.0, raw))


def _normalize_weights(weights: WeightDict) -> WeightDict:
    """
    Return a new weight dict whose values sum to exactly 1.0.
    Raises ValueError if all weights are zero.
    """
    total = sum(weights.values())
    if total == 0:
        raise ValueError("Weight profile has all-zero weights.")
    return {k: v / total for k, v in weights.items()}


def _impute_pool(teams: list[TeamInput]) -> dict[str, dict[int, float]]:
    """
    Build a lookup table:  metric → { team_id → imputed_value }

    Missing values are replaced by the pool median for that metric.
    """
    imputed: dict[str, dict[int, float]] = {}
    for metric in METRIC_FIELDS:
        pool_values = _collect_values(teams, metric)
        fallback = _median(pool_values) if pool_values else 0.0
        imputed[metric] = {
            t.team_id: (getattr(t, metric) if getattr(t, metric) is not None else fallback)
            for t in teams
        }
    return imputed


def _build_percentile_table(
    teams: list[TeamInput],
    imputed: dict[str, dict[int, float]],
) -> dict[int, dict[str, float]]:
    """
    Compute direction-corrected percentile ranks for every (team, metric) pair.

    Returns: { team_id → { metric → percentile_in_[0,100] } }
    """
    percentiles: dict[int, dict[str, float]] = {t.team_id: {} for t in teams}

    for metric in METRIC_FIELDS:
        # All imputed values for this metric across the pool
        pool: list[float] = [imputed[metric][t.team_id] for t in teams]
        higher_is_better: bool = METRIC_DIRECTION[metric]

        for team in teams:
            raw_pct = _percentile_rank(imputed[metric][team.team_id], pool)

            # Invert so that 100 always means "best" regardless of direction
            corrected = raw_pct if higher_is_better else (100.0 - raw_pct)
            percentiles[team.team_id][metric] = round(corrected, 2)

    return percentiles


def _weighted_score(
    percentiles: dict[str, float],
    normalized_weights: WeightDict,
) -> float:
    """
    Dot-product of a team's percentile vector with the normalized weight vector.

    Only metrics present in *normalized_weights* contribute to the score.
    Missing metrics (not in percentiles) are treated as 50.0 (neutral).
    """
    score = sum(
        normalized_weights.get(metric, 0.0) * percentiles.get(metric, 50.0)
        for metric in normalized_weights
    )
    return round(score, 4)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_march_scores(
    teams: list[TeamInput],
    profile: Union[str, WeightDict],
) -> RankingsResult:
    """
    Score every team in *teams* using *profile* and return a ranked
    ``RankingsResult``.

    Parameters
    ----------
    teams:
        List of ``TeamInput`` objects. Should all belong to the same season
        (mixed seasons give misleading percentile ranks).
    profile:
        Either a built-in profile name string (e.g. ``"balanced"``) or an
        arbitrary ``WeightDict`` for custom profiles.

    Returns
    -------
    RankingsResult
        ``.teams`` sorted descending by ``march_score``.
        ``.teams[0]`` is rank 1 (best).
    """
    if not teams:
        season = 0
        profile_name = profile if isinstance(profile, str) else "custom"
        return RankingsResult(profile_name=profile_name, season=season, teams=[])

    season = teams[0].season

    # Resolve weights
    if isinstance(profile, str):
        profile_name = profile
        raw_weights = get_profile_weights(profile_name)
    else:
        profile_name = "custom"
        raw_weights = profile

    normalized_weights = _normalize_weights(raw_weights)

    # Step 1 — impute missing values
    imputed = _impute_pool(teams)

    # Step 2 — percentile ranks (direction-corrected)
    percentile_table = _build_percentile_table(teams, imputed)

    # Step 3 — weighted scores
    scored: list[ScoredTeam] = []
    for team in teams:
        pcts = percentile_table[team.team_id]
        march_score = _weighted_score(pcts, normalized_weights)

        raw_metrics = {
            m: getattr(team, m) for m in METRIC_FIELDS
        }

        scored.append(
            ScoredTeam(
                rank=0,  # assigned below after sorting
                team_id=team.team_id,
                team_name=team.team_name,
                seed=team.seed,
                region=team.region,
                conference=team.conference,
                season=team.season,
                record_wins=team.record_wins,
                record_losses=team.record_losses,
                march_score=march_score,
                metric_percentiles=pcts,
                raw_metrics=raw_metrics,
            )
        )

    # Sort descending; stable so identical scores keep insertion order
    scored.sort(key=lambda t: t.march_score, reverse=True)

    # Assign 1-based ranks (tied teams get the same rank)
    current_rank = 1
    for i, team in enumerate(scored):
        if i > 0 and team.march_score < scored[i - 1].march_score:
            current_rank = i + 1
        team.rank = current_rank

    return RankingsResult(profile_name=profile_name, season=season, teams=scored)


def _matchup_delta(team_a: TeamInput, team_b: TeamInput) -> float:
    """
    Compute a small score adjustment for team_a based on how their offense
    attacks team_b's defense — and vice versa.

    Captures the "does Team A's strength attack Team B's weakness?" question
    that raw march scores miss (two teams can have similar scores but very
    different matchup dynamics).

    Returns a value in approximately [-5, +5] to add to team_a's march score.
    Negative means team_b benefits from the matchup quality delta.

    Two components:
      1. adj_o vs adj_d: expected net scoring differential
      2. eFG% vs opp eFG%: shooting efficiency vs shot suppression
    """
    components: list[float] = []

    # Component 1: offensive efficiency vs opponent's defense
    if None not in (team_a.adj_o, team_b.adj_d, team_b.adj_o, team_a.adj_d):
        net_a = team_a.adj_o - team_b.adj_d   # how much A scores vs B's defense
        net_b = team_b.adj_o - team_a.adj_d   # how much B scores vs A's defense
        # adj values ~85-135; net range ~-45 to +45; difference ~-90 to +90
        components.append((net_a - net_b) / 70.0 * 3.5)  # → [-3.5, +3.5]

    # Component 2: shooting efficiency vs shot suppression
    if None not in (team_a.efg_pct, team_b.opp_efg_pct, team_b.efg_pct, team_a.opp_efg_pct):
        shoot_a = team_a.efg_pct - team_b.opp_efg_pct   # A shoots well vs B's D?
        shoot_b = team_b.efg_pct - team_a.opp_efg_pct   # B shoots well vs A's D?
        # Each component ~-0.25 to +0.25; difference ~-0.50 to +0.50
        components.append((shoot_a - shoot_b) / 0.45 * 2.5)  # → [-2.5, +2.5]

    if not components:
        return 0.0

    raw = sum(components) / len(components)
    return max(-5.0, min(5.0, raw))


def _apply_seed_compression(
    scored_a: ScoredTeam,
    scored_b: ScoredTeam,
    seed_a: int | None,
    seed_b: int | None,
) -> tuple[ScoredTeam, ScoredTeam]:
    """
    Compress the march score gap toward 50/50 for historically upset-prone
    R64 seed matchups (e.g. 12v5, 11v6, 9v8).

    Moves both scores toward their midpoint by the compression factor —
    a factor of 0.70 means the gap shrinks to 70% of its original size.
    The winner does not change unless the delta pushed it over the edge.
    """
    if seed_a is None or seed_b is None:
        return scored_a, scored_b

    fav_seed = min(seed_a, seed_b)
    dog_seed = max(seed_a, seed_b)

    compression = SEED_UPSET_COMPRESSION.get((fav_seed, dog_seed))
    if compression is None or compression >= 1.0:
        return scored_a, scored_b

    mid = (scored_a.march_score + scored_b.march_score) / 2.0
    scored_a.march_score = round(mid + (scored_a.march_score - mid) * compression, 4)
    scored_b.march_score = round(mid + (scored_b.march_score - mid) * compression, 4)
    return scored_a, scored_b


def score_single_matchup(
    team_a: TeamInput,
    team_b: TeamInput,
    profile: Union[str, WeightDict],
    round_num: int | None = None,
) -> tuple[ScoredTeam, ScoredTeam]:
    """
    Score two teams head-to-head using only each other as the normalization pool.

    When *round_num* is provided (bracket context), three additional adjustments
    are applied on top of the base percentile scoring:

      1. Round-specific weight multipliers — boosts chaos metrics in R64,
         efficiency/defense in later rounds, defense-heavy in Championship.
      2. Matchup delta — small bonus for the team whose offense better
         attacks the opponent's defensive weakness (adj_o vs adj_d, eFG% vs
         opponent eFG% allowed).
      3. Seed compression — for R64 only, compresses the score gap toward
         50/50 for historically upset-prone matchups (9v8, 12v5, 11v6, etc.).

    When round_num=None (Matchup Analyzer), returns plain head-to-head scores
    with no round context — existing behavior is fully preserved.
    """
    # Resolve round-aware weights (no-op when round_num is None or profile is a dict)
    if round_num is not None and isinstance(profile, str):
        effective: Union[str, WeightDict] = get_effective_weights(profile, round_num)
    else:
        effective = profile

    result = compute_march_scores([team_a, team_b], effective)
    a = result.get_team(team_a.team_id)
    b = result.get_team(team_b.team_id)
    assert a is not None and b is not None

    # Matchup delta: adjust scores based on offense-vs-defense quality
    delta = _matchup_delta(team_a, team_b)
    a.march_score = round(a.march_score + delta, 4)
    b.march_score = round(b.march_score - delta, 4)

    # Seed compression: R64 only, for known upset-prone matchups
    if round_num == 1:
        a, b = _apply_seed_compression(a, b, team_a.seed, team_b.seed)

    return a, b
