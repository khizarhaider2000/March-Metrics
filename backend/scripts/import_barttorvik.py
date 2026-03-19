"""
scripts/import_barttorvik.py

Imports real advanced metrics from a Barttorvik CSV export and updates
the TeamMetrics rows for the given season.

──────────────────────────────────────────────────────────────────────
HOW TO GET THE CSV
──────────────────────────────────────────────────────────────────────
1. Go to https://barttorvik.com/#  (choose year 2026 in the dropdown)
2. Scroll to the bottom — click the "Download" button (CSV icon)
3. Save the file as e.g. barttorvik_2026.csv
4. Run:

   cd backend
   source .venv/bin/activate
   python -m scripts.import_barttorvik barttorvik_2026.csv --season 2026

──────────────────────────────────────────────────────────────────────
COLUMN MAPPING  (Barttorvik CSV → our schema)
──────────────────────────────────────────────────────────────────────
Barttorvik column name      → our field       notes
─────────────────────────── ─────────────── ──────────────────────────
AdjOE  / Adj OE             → adj_o          points per 100 possessions
AdjDE  / Adj DE             → adj_d          points allowed per 100
AdjEM                       → adj_em         OE − DE  (computed if absent)
EFG%   / eFG%               → efg_pct        decimal (divide by 100)
EFGD%  / eFGD%              → opp_efg_pct    decimal (divide by 100)
TOR    / TO%                → to_pct         decimal (divide by 100)
TORD   / TOD%               → opp_to_pct     decimal (divide by 100)
ORB    / OR%                → orb_pct        decimal (divide by 100)
DRB    / DR%                → drb_pct        decimal (divide by 100)
FTR    / FT Rate            → ft_rate        FTA/FGA  (decimal)
Adj T. / Tempo              → tempo          possessions per 40 min
OppAdj / SOS / Barthag SOS  → sos            (optional; skipped if absent)
"""

import csv
import sys
import os
import argparse

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.models.team import Team, TeamMetrics

# ──────────────────────────────────────────────────────────────────────────────
# Team name normalisation + manual overrides
# ──────────────────────────────────────────────────────────────────────────────

# Barttorvik name  →  our seed_season.py name
BARTO_TO_OURS: dict[str, str] = {
    "Miami FL":              "Miami (FL)",
    "Miami OH":              "Miami (OH)",
    "NC State":              "NC State",
    "North Carolina St.":    "NC State",
    "Saint Mary's":          "Saint Mary's",
    "St. John's":            "St. John's",
    "Prairie View A&M":      "Prairie View A&M",
    "Cal Baptist":           "California Baptist",
    "N. Dakota St.":         "North Dakota State",
    "North Dakota St.":      "North Dakota State",
    "N. Iowa":               "Northern Iowa",
    "Northern Iowa":         "Northern Iowa",
    "Kennesaw St.":          "Kennesaw State",
    "Wright St.":            "Wright State",
    "Tennessee St.":         "Tennessee State",
    "Lehigh":                "Lehigh",
    "UMBC":                  "UMBC",
    "Howard":                "Howard",
    "LIU":                   "LIU",
    "SMU":                   "SMU",
    "VCU":                   "VCU",
    "BYU":                   "BYU",
    "UCF":                   "UCF",
    "TCU":                   "TCU",
    "Penn":                  "Penn",
}


def _normalise(name: str) -> str:
    """Lowercase, strip punctuation noise for fuzzy matching."""
    return (
        name.lower()
        .replace(".", "")
        .replace("&", "and")
        .replace("-", " ")
        .replace("(", "")
        .replace(")", "")
        .strip()
    )


def _match(barto_name: str, our_names: list[str]) -> str | None:
    """
    1. Direct override dict hit
    2. Exact match after normalisation
    3. Substring match (longer team name contains shorter)
    Returns the matched `our_name` or None.
    """
    if barto_name in BARTO_TO_OURS:
        mapped = BARTO_TO_OURS[barto_name]
        if mapped in our_names:
            return mapped

    b_norm = _normalise(barto_name)
    for our in our_names:
        if _normalise(our) == b_norm:
            return our

    # Substring fallback
    for our in our_names:
        o_norm = _normalise(our)
        if b_norm in o_norm or o_norm in b_norm:
            return our

    return None


# ──────────────────────────────────────────────────────────────────────────────
# CSV column aliases  (handles different Barttorvik export versions)
# ──────────────────────────────────────────────────────────────────────────────

ALIASES: dict[str, list[str]] = {
    "adj_o":        ["AdjOE", "Adj OE", "adjoe", "AdjO"],
    "adj_d":        ["AdjDE", "Adj DE", "adjde", "AdjD"],
    "adj_em":       ["AdjEM", "Adj EM", "adjtem", "NetRtg"],
    "efg_pct":      ["EFG%", "eFG%", "EFGPct", "efg_o"],
    "opp_efg_pct":  ["EFGD%", "eFGD%", "EFGDPct", "efg_d"],
    "to_pct":       ["TOR", "TO%", "TOPct", "torate"],
    "opp_to_pct":   ["TORD", "TOD%", "TODPct", "torated"],
    "orb_pct":      ["ORB", "OR%", "ORPct", "ORB%", "oreb_pct"],
    "drb_pct":      ["DRB", "DR%", "DRPct", "DRB%", "dreb_pct"],
    "ft_rate":      ["FTR", "FT Rate", "FTRate", "ftr"],
    "tempo":        ["Adj T.", "Tempo", "AdjTempo", "adj_tempo"],
    "sos":          ["OppAdj", "SOS", "Barthag SOS", "sos"],
    "team":         ["Team", "team", "TeamName"],
}


def _find_col(headers: list[str], field: str) -> str | None:
    for alias in ALIASES.get(field, [field]):
        if alias in headers:
            return alias
    return None


def _pct(val: str) -> float | None:
    """Convert '52.3' → 0.523  or  '0.523' → 0.523 (already decimal)."""
    try:
        f = float(val)
        return f / 100.0 if f > 1.5 else f   # heuristic: >1.5 means it's a percentage
    except (ValueError, TypeError):
        return None


def _float(val: str) -> float | None:
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Import Barttorvik CSV into TeamMetrics")
    parser.add_argument("csv_file", help="Path to the downloaded Barttorvik CSV")
    parser.add_argument("--season", type=int, default=2026, help="Season year (default 2026)")
    parser.add_argument("--dry-run", action="store_true", help="Print matches without writing to DB")
    args = parser.parse_args()

    if not os.path.exists(args.csv_file):
        print(f"ERROR: file not found: {args.csv_file}")
        sys.exit(1)

    # ── Load CSV ──────────────────────────────────────────────────────────────
    with open(args.csv_file, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    if not rows:
        print("ERROR: CSV is empty")
        sys.exit(1)

    headers = list(rows[0].keys())
    print(f"Loaded {len(rows)} rows.  Columns: {headers[:10]} …")

    team_col = _find_col(headers, "team")
    if not team_col:
        print(f"ERROR: can't find a team name column. Headers: {headers}")
        sys.exit(1)

    # ── Connect to DB ─────────────────────────────────────────────────────────
    init_db()
    db = SessionLocal()

    try:
        teams = db.query(Team).filter_by(season=args.season).all()
        if not teams:
            print(f"ERROR: no teams found for season {args.season}. Run seed_season.py first.")
            sys.exit(1)

        our_names = [t.team_name for t in teams]
        team_by_name = {t.team_name: t for t in teams}

        updated, skipped, unmatched = 0, 0, []

        for row in rows:
            barto_name = row.get(team_col, "").strip()
            if not barto_name:
                continue

            our_name = _match(barto_name, our_names)
            if our_name is None:
                unmatched.append(barto_name)
                continue

            team = team_by_name[our_name]
            if team.metrics is None:
                skipped += 1
                continue

            m = team.metrics

            def col(field: str) -> str | None:
                c = _find_col(headers, field)
                return row.get(c, "").strip() if c else None

            adj_o_val  = _float(col("adj_o")  or "")
            adj_d_val  = _float(col("adj_d")  or "")
            adj_em_raw = _float(col("adj_em") or "")

            if adj_o_val is not None:  m.adj_o       = adj_o_val
            if adj_d_val is not None:  m.adj_d       = adj_d_val
            # Use AdjEM directly if present, else compute OE − DE
            if adj_em_raw is not None:
                m.adj_em = adj_em_raw
            elif adj_o_val is not None and adj_d_val is not None:
                m.adj_em = round(adj_o_val - adj_d_val, 2)

            efg  = _pct(col("efg_pct")     or "")
            efgd = _pct(col("opp_efg_pct") or "")
            tor  = _pct(col("to_pct")      or "")
            tord = _pct(col("opp_to_pct")  or "")
            orb  = _pct(col("orb_pct")     or "")
            drb  = _pct(col("drb_pct")     or "")
            ftr  = _pct(col("ft_rate")     or "")
            tmp  = _float(col("tempo")     or "")
            sos  = _float(col("sos")       or "")

            if efg  is not None: m.efg_pct     = efg
            if efgd is not None: m.opp_efg_pct = efgd
            if tor  is not None: m.to_pct      = tor
            if tord is not None: m.opp_to_pct  = tord
            if orb  is not None: m.orb_pct     = orb
            if drb  is not None: m.drb_pct     = drb
            if ftr  is not None: m.ft_rate     = ftr
            if tmp  is not None: m.tempo       = tmp
            if sos  is not None: m.sos         = sos

            if args.dry_run:
                print(f"  [dry-run] {barto_name!r} → {our_name!r}  adj_em={m.adj_em} adj_o={m.adj_o} adj_d={m.adj_d}")
            else:
                db.add(m)

            updated += 1

        if not args.dry_run:
            db.commit()

        # ── Summary ───────────────────────────────────────────────────────────
        print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Results for season {args.season}:")
        print(f"  Updated : {updated}")
        print(f"  Skipped : {skipped}  (no metrics row)")
        if unmatched:
            print(f"  Unmatched Barttorvik teams ({len(unmatched)}):")
            for n in sorted(unmatched):
                print(f"    '{n}'")
            print("\nFor each unmatched team, add an entry to BARTO_TO_OURS at the top of this script.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
