"""
scripts/seed_season.py

Populates the database with the 2026 NCAA tournament field.
Team identities, seeds, regions, and First Four slots reflect the
Selection Sunday bracket released on March 15, 2026. Advanced metrics
remain generated placeholders until a real stats feed is wired in.

Usage:
    cd backend
    source .venv/bin/activate
    python -m scripts.seed_season
"""

import sys
import os

# Allow running from /backend root
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.models.team import Team, TeamMetrics

SEASON = 2026

# ---------------------------------------------------------------------------
# 2026 field — 68 teams including First Four slots.
# Duplicate (region, seed) pairs are the play-in matchups.
# Format: (team_name, conference, record_wins, record_losses, seed, region)
# ---------------------------------------------------------------------------

TOURNAMENT_TEAMS = [
    # ── EAST ──────────────────────────────────────────────────────────────
    ("Duke",              "ACC",           32,  2, 1,  "East"),
    ("UConn",             "Big East",      29,  5, 2,  "East"),
    ("Michigan State",    "Big Ten",       25,  7, 3,  "East"),
    ("Kansas",            "Big 12",        23, 10, 4,  "East"),
    ("St. John's",        "Big East",      28,  6, 5,  "East"),
    ("Louisville",        "ACC",           23, 10, 6,  "East"),
    ("UCLA",              "Big Ten",       23, 11, 7,  "East"),
    ("Ohio State",        "Big Ten",       21, 12, 8,  "East"),
    ("TCU",               "Big 12",        22, 11, 9,  "East"),
    ("UCF",               "Big 12",        21, 11,10,  "East"),
    ("South Florida",     "American",      25,  8,11,  "East"),
    ("Northern Iowa",     "Missouri Valley",23, 12,12, "East"),
    ("California Baptist","WAC",           25,  8,13,  "East"),
    ("North Dakota State","Summit",        27,  7,14,  "East"),
    ("Furman",            "Southern",      22, 12,15,  "East"),
    ("Siena",             "MAAC",          23, 11,16,  "East"),

    # ── WEST ──────────────────────────────────────────────────────────────
    ("Arizona",           "Big 12",        32,  2, 1,  "West"),
    ("Purdue",            "Big Ten",       27,  8, 2,  "West"),
    ("Gonzaga",           "WCC",           30,  3, 3,  "West"),
    ("Arkansas",          "SEC",           26,  8, 4,  "West"),
    ("Wisconsin",         "Big Ten",       24, 10, 5,  "West"),
    ("BYU",               "Big 12",        23, 11, 6,  "West"),
    ("Miami (FL)",        "ACC",           25,  8, 7,  "West"),
    ("Villanova",         "Big East",      24,  8, 8,  "West"),
    ("Utah State",        "Mountain West", 28,  6, 9,  "West"),
    ("Missouri",          "SEC",           20, 12,10,  "West"),
    ("Texas",             "SEC",           18, 14,11,  "West"),
    ("NC State",          "ACC",           20, 13,11,  "West"),
    ("High Point",        "Big South",     30,  4,12,  "West"),
    ("Hawaii",            "Big West",      24,  8,13,  "West"),
    ("Kennesaw State",    "C-USA",         21, 13,14,  "West"),
    ("Queens",            "ASUN",          21, 13,15,  "West"),
    ("LIU",               "NEC",           24, 10,16,  "West"),

    # ── SOUTH ─────────────────────────────────────────────────────────────
    ("Florida",           "SEC",           26,  7, 1,  "South"),
    ("Houston",           "Big 12",        28,  6, 2,  "South"),
    ("Illinois",          "Big Ten",       24,  7, 3,  "South"),
    ("Nebraska",          "Big Ten",       26,  6, 4,  "South"),
    ("Vanderbilt",        "SEC",           26,  8, 5,  "South"),
    ("North Carolina",    "ACC",           24,  8, 6,  "South"),
    ("Saint Mary's",      "WCC",           27,  5, 7,  "South"),
    ("Clemson",           "ACC",           24, 10, 8,  "South"),
    ("Iowa",              "Big Ten",       21, 12, 9,  "South"),
    ("Texas A&M",         "SEC",           21, 11,10,  "South"),
    ("VCU",               "Atlantic 10",   27,  7,11,  "South"),
    ("McNeese",           "Southland",     28,  5,12,  "South"),
    ("Troy",              "Sun Belt",      22, 11,13,  "South"),
    ("Penn",              "Ivy",           18, 11,14,  "South"),
    ("Idaho",             "Big Sky",       21, 14,15,  "South"),
    ("Prairie View A&M",  "SWAC",          18, 17,16,  "South"),
    ("Lehigh",            "Patriot",       18, 16,16,  "South"),

    # ── MIDWEST ───────────────────────────────────────────────────────────
    ("Michigan",          "Big Ten",       31,  3, 1,  "Midwest"),
    ("Iowa State",        "Big 12",        27,  7, 2,  "Midwest"),
    ("Virginia",          "ACC",           29,  5, 3,  "Midwest"),
    ("Alabama",           "SEC",           23,  9, 4,  "Midwest"),
    ("Texas Tech",        "Big 12",        22, 10, 5,  "Midwest"),
    ("Tennessee",         "SEC",           22, 11, 6,  "Midwest"),
    ("Kentucky",          "SEC",           21, 13, 7,  "Midwest"),
    ("Georgia",           "SEC",           22, 10, 8,  "Midwest"),
    ("Saint Louis",       "Atlantic 10",   28,  5, 9,  "Midwest"),
    ("Santa Clara",       "WCC",           26,  8,10,  "Midwest"),
    ("Miami (OH)",        "MAC",           31,  1,11,  "Midwest"),
    ("SMU",               "ACC",           20, 13,11,  "Midwest"),
    ("Akron",             "MAC",           29,  5,12,  "Midwest"),
    ("Hofstra",           "CAA",           24, 10,13,  "Midwest"),
    ("Wright State",      "Horizon",       23, 11,14,  "Midwest"),
    ("Tennessee State",   "Ohio Valley",   23,  9,15,  "Midwest"),
    ("UMBC",              "America East",  24,  8,16,  "Midwest"),
    ("Howard",            "MEAC",          23, 10,16,  "Midwest"),
]

# ---------------------------------------------------------------------------
# Mock metrics — placeholder values loosely correlated with seed quality.
# Higher seed = generally better adj_em. Replace with real data.
# ---------------------------------------------------------------------------

import random
random.seed(42)

def _metrics_for_seed(seed: int) -> dict:
    """Generate plausible (but fake) metrics based on tournament seed."""
    base_em = max(35.0 - seed * 2.0 + random.uniform(-1.5, 1.5), -5.0)
    adj_o = 115.0 - seed * 0.8 + random.uniform(-2, 2)
    adj_d = 90.0 + seed * 0.7 + random.uniform(-2, 2)
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


def seed_season(db) -> None:
    existing = db.query(Team).filter_by(season=SEASON).all()
    if existing:
        for team in existing:
            db.delete(team)
        db.flush()
        print(f"Replaced existing season {SEASON} field ({len(existing)} teams).")

    for name, conf, wins, losses, seed, region in TOURNAMENT_TEAMS:
        team = Team(
            season=SEASON,
            team_name=name,
            seed=seed,
            region=region,
            conference=conf,
            record_wins=wins,
            record_losses=losses,
        )
        db.add(team)
        db.flush()  # get team.id before creating metrics

        m = _metrics_for_seed(seed)
        metrics = TeamMetrics(team_id=team.id, **m)
        db.add(metrics)

    db.commit()
    print(f"Seeded {len(TOURNAMENT_TEAMS)} teams for season {SEASON}.")


if __name__ == "__main__":
    print("Initializing database...")
    init_db()

    db = SessionLocal()
    try:
        seed_season(db)
    finally:
        db.close()

    print("Done.")
