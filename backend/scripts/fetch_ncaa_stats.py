"""
scripts/fetch_ncaa_stats.py

Fetches NCAA D1 regular-season counting stats from the henrygd NCAA API
(https://ncaa-api.henrygd.me) and writes them to the database.

The API is used ONLY at import time. The deployed app never calls it.

Metrics written to RawTeamStats
────────────────────────────────
gp, wins, losses
pts, opp_pts
fgm, fga, fg3m, fg3a
ftm, fta
opp_fgm, opp_fga, opp_fg3m, opp_fg3a
trb, opp_trb
tov, opp_tov

Derived metrics written to TeamMetrics (computed from raw data)
────────────────────────────────────────────────────────────────
efg_pct     = (fgm + 0.5 * fg3m) / fga
opp_efg_pct = (opp_fgm + 0.5 * opp_fg3m) / opp_fga
ft_rate     = fta / fga

Metrics left null here (require adjusted models; set by fetch_stats.py):
  adj_o, adj_d, adj_em, tempo, sos, to_pct, opp_to_pct, orb_pct, drb_pct

Usage:
    cd backend
    source .venv/bin/activate
    python -m scripts.fetch_ncaa_stats --season 2026 --dry-run
    python -m scripts.fetch_ncaa_stats --season 2026
"""

import argparse
import os
import sys
import time
from datetime import datetime, timezone

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.models.team import Team, TeamMetrics
from app.models.raw_stats import RawTeamStats

API_BASE = "https://ncaa-api.henrygd.me"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
}

# ── Stat category IDs ─────────────────────────────────────────────────────────
# Each ID maps to one stats page on NCAA.com that the API proxies.

CATS: dict[str, int] = {
    "scoring_off": 145,  # GM, PTS, PPG
    "scoring_def": 146,  # GM, OPP PTS, OPP PPG
    "fg":          148,  # GM, FGM, FGA, FG%
    "fg_def":      149,  # GM, OPP FG, OPP FGA, OPP FG%
    "ft":          150,  # GM, FT, FTA, FT%
    "fg3":         152,  # GM, 3FG, 3FGA, 3FG%
    "fg3_def":     518,  # GM, Opp 3FGA, Opp 3FG, Pct
    "tov":         217,  # GM, TO, TOPG
    "tov_margin":  519,  # GM, Opp TO, TO, Ratio   (Opp TO = turnovers we forced)
    "reb":         151,  # GM, REB, RPG, OPP REB, OPP RPG, REB MAR
    "win_pct":     168,  # W, L, Pct
    # New: playmaking / pressure
    "blk":         214,  # GM, BLKS, BKPG
    "stl":         215,  # GM, ST, STPG
    "ast":         216,  # GM, AST, APG
}

# ── Name overrides ────────────────────────────────────────────────────────────
# NCAA API name (as returned) → our team name in seed_season.py

NCAA_TO_OURS: dict[str, str] = {
    # "State" abbreviations  (one entry per team — no duplicates)
    "Michigan St.":         "Michigan State",
    "Kennesaw St.":         "Kennesaw State",
    "North Dakota St.":     "North Dakota State",
    "Tennessee St.":        "Tennessee State",
    "Wright St.":           "Wright State",
    "Utah St.":             "Utah State",
    "Iowa St.":             "Iowa State",
    "Ohio St.":             "Ohio State",
    # Location abbreviations
    "South Fla.":           "South Florida",
    "UNI":                  "Northern Iowa",      # NCAA.com uses "UNI" for Northern Iowa
    "Cal Baptist":          "California Baptist",
    "Prairie View":         "Prairie View A&M",   # NCAA.com drops "A&M"
    # Saint / St.
    "Saint Mary's (CA)":    "Saint Mary's",       # NCAA.com appends "(CA)"
    "St. John's (NY)":      "St. John's",
    # Parenthetical / regional suffixes
    "Queens (NC)":          "Queens",
    "Miami (FL)":           "Miami (FL)",
    "Miami (OH)":           "Miami (OH)",
    # Already match; listed for documentation
    "SMU": "SMU", "BYU": "BYU", "TCU": "TCU",
    "UCF": "UCF", "VCU": "VCU", "UMBC": "UMBC", "LIU": "LIU",
}

# Reverse map built at startup: our_name → normalised NCAA API name
_OUR_TO_NCAA_NORM: dict[str, str] = {}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _norm(name: str) -> str:
    return (
        name.lower()
        .replace(".", "")
        .replace("&", "and")
        .replace("-", " ")
        .replace("(", "")
        .replace(")", "")
        .strip()
    )


def _build_reverse() -> None:
    """Populate _OUR_TO_NCAA_NORM from NCAA_TO_OURS."""
    for ncaa_name, our_name in NCAA_TO_OURS.items():
        ncaa_norm = _norm(ncaa_name)
        our_norm  = _norm(our_name)
        if ncaa_norm != our_norm:
            _OUR_TO_NCAA_NORM[our_name] = ncaa_norm


def _row_for(our_name: str, data: dict[str, dict]) -> dict:
    """Return the API row for one of our team names, or {} if not found."""
    row = data.get(_norm(our_name))
    if row:
        return row
    ncaa_norm = _OUR_TO_NCAA_NORM.get(our_name)
    if ncaa_norm:
        return data.get(ncaa_norm) or {}
    return {}


def _fetch_category(cat_id: int) -> dict[str, dict]:
    """
    Fetch all pages for one stat category.
    Returns {normalised_ncaa_name: row_dict}.
    """
    url = f"{API_BASE}/stats/basketball-men/d1/current/team/{cat_id}"
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    payload = resp.json()
    pages = payload.get("pages", 1)

    result: dict[str, dict] = {}

    def _ingest(rows: list[dict]) -> None:
        for row in rows:
            name = row.get("Team", "").strip()
            if name:
                result[_norm(name)] = row

    _ingest(payload.get("data", []))

    for page in range(2, pages + 1):
        time.sleep(0.25)
        r = requests.get(f"{url}?page={page}", headers=HEADERS, timeout=20)
        r.raise_for_status()
        _ingest(r.json().get("data", []))

    print(f"    cat {cat_id:>4}: {len(result):>4} teams across {pages} page(s)")
    return result


def _int(val: object) -> int | None:
    try:
        return int(val)  # type: ignore[arg-type]
    except (ValueError, TypeError):
        return None


def _fmt(v: float | None) -> str:
    return f"{v:.3f}" if v is not None else "N/A"


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Import NCAA API counting stats into TeamMetrics")
    parser.add_argument("--season",  type=int, default=2026)
    parser.add_argument("--dry-run", action="store_true", help="Print matches without writing to DB")
    args = parser.parse_args()

    _build_reverse()

    print("Fetching NCAA API stat categories…")
    cats: dict[str, dict[str, dict]] = {}
    for name, cat_id in CATS.items():
        cats[name] = _fetch_category(cat_id)
        time.sleep(0.3)

    init_db()
    db = SessionLocal()

    try:
        teams = db.query(Team).filter_by(season=args.season).all()
        if not teams:
            print(f"ERROR: no teams for season {args.season}. Run seed_season.py first.")
            sys.exit(1)

        matched: list[str] = []
        unmatched: list[str] = []
        ts = datetime.now(timezone.utc).isoformat()

        for team in teams:
            our = team.team_name

            # Pull the relevant row from each category (empty dict if not found)
            fg    = _row_for(our, cats["fg"])
            fg3   = _row_for(our, cats["fg3"])
            ft    = _row_for(our, cats["ft"])
            fg_d  = _row_for(our, cats["fg_def"])
            fg3_d = _row_for(our, cats["fg3_def"])
            off   = _row_for(our, cats["scoring_off"])
            def_  = _row_for(our, cats["scoring_def"])
            reb   = _row_for(our, cats["reb"])
            tov   = _row_for(our, cats["tov"])
            tov_m = _row_for(our, cats["tov_margin"])
            win   = _row_for(our, cats["win_pct"])
            blk_r = _row_for(our, cats["blk"])
            stl_r = _row_for(our, cats["stl"])
            ast_r = _row_for(our, cats["ast"])

            # FG data is the anchor: if we can't find it, the team is unmatched
            if not fg:
                unmatched.append(our)
                continue

            # ── Raw counting totals ────────────────────────────────────────────
            gp       = _int(fg.get("GM")     or off.get("GM"))
            fgm      = _int(fg.get("FGM"))
            fga      = _int(fg.get("FGA"))
            fg3m     = _int(fg3.get("3FG"))
            fg3a     = _int(fg3.get("3FGA"))
            ftm      = _int(ft.get("FT"))
            fta      = _int(ft.get("FTA"))
            opp_fgm  = _int(fg_d.get("OPP FG"))
            opp_fga  = _int(fg_d.get("OPP FGA"))
            opp_fg3m = _int(fg3_d.get("Opp 3FG"))
            opp_fg3a = _int(fg3_d.get("Opp 3FGA"))
            pts      = _int(off.get("PTS"))
            opp_pts  = _int(def_.get("OPP PTS"))
            trb      = _int(reb.get("REB"))
            opp_trb  = _int(reb.get("OPP REB"))
            tov_n    = _int(tov.get("TO"))
            opp_tov  = _int(tov_m.get("Opp TO"))
            wins     = _int(win.get("W"))
            losses   = _int(win.get("L"))
            blk      = _int(blk_r.get("BLKS"))
            stl      = _int(stl_r.get("ST"))
            ast      = _int(ast_r.get("AST"))

            # ── Original derived metrics ───────────────────────────────────────
            efg_pct = opp_efg_pct = ft_rate = None

            if fgm is not None and fg3m is not None and fga:
                efg_pct = round((fgm + 0.5 * fg3m) / fga, 4)

            if opp_fgm is not None and opp_fg3m is not None and opp_fga:
                opp_efg_pct = round((opp_fgm + 0.5 * opp_fg3m) / opp_fga, 4)

            if fta is not None and fga:
                ft_rate = round(fta / fga, 4)

            # ── Extended derived metrics ───────────────────────────────────────

            # opp_ft_rate: opponent made FTs per opponent FGA
            # opp_ftm derived from scoring: opp_pts = 2*opp_fgm + opp_fg3m + opp_ftm
            opp_ft_rate = None
            if opp_pts is not None and opp_fgm is not None and opp_fg3m is not None and opp_fga:
                opp_ftm = opp_pts - 2 * opp_fgm - opp_fg3m
                if opp_ftm >= 0:
                    opp_ft_rate = round(opp_ftm / opp_fga, 4)

            # ast_pct: assists per field goal made
            ast_pct = None
            if ast is not None and fgm and fgm > 0:
                ast_pct = round(ast / fgm, 4)

            # three_pt_rate: share of shots attempted from 3
            three_pt_rate = None
            if fg3a is not None and fga and fga > 0:
                three_pt_rate = round(fg3a / fga, 4)

            # opp_three_pt_rate: share of opponent shots attempted from 3
            opp_three_pt_rate = None
            if opp_fg3a is not None and opp_fga and opp_fga > 0:
                opp_three_pt_rate = round(opp_fg3a / opp_fga, 4)

            # two_pt_pct: 2-point field goal percentage
            two_pt_pct = None
            if fgm is not None and fg3m is not None and fga is not None and fg3a is not None:
                two_pa = fga - fg3a
                if two_pa > 0:
                    two_pt_pct = round((fgm - fg3m) / two_pa, 4)

            # opp_two_pt_pct: opponent 2-point field goal percentage
            opp_two_pt_pct = None
            if opp_fgm is not None and opp_fg3m is not None and opp_fga is not None and opp_fg3a is not None:
                opp_two_pa = opp_fga - opp_fg3a
                if opp_two_pa > 0:
                    opp_two_pt_pct = round((opp_fgm - opp_fg3m) / opp_two_pa, 4)

            # steal_pct: steals per opponent FGA (proxy for steals per possession)
            steal_pct = None
            if stl is not None and opp_fga and opp_fga > 0:
                steal_pct = round(stl / opp_fga, 4)

            # block_pct: blocks per opponent 2-point attempt
            block_pct = None
            if blk is not None and opp_fga is not None and opp_fg3a is not None:
                opp_2pa = opp_fga - opp_fg3a
                if opp_2pa > 0:
                    block_pct = round(blk / opp_2pa, 4)

            if args.dry_run:
                print(
                    f"  [dry] {our:28s}  gp={gp!s:>2}  "
                    f"efg={_fmt(efg_pct)}  opp_efg={_fmt(opp_efg_pct)}  ft={_fmt(ft_rate)}  "
                    f"ast={_fmt(ast_pct)}  3pr={_fmt(three_pt_rate)}  stl={_fmt(steal_pct)}  blk={_fmt(block_pct)}"
                )
            else:
                # Upsert RawTeamStats
                raw = db.query(RawTeamStats).filter_by(team_id=team.id).first()
                if raw is None:
                    raw = RawTeamStats(team_id=team.id)
                    db.add(raw)

                raw.source     = "ncaa-api"
                raw.fetched_at = ts
                raw.gp         = gp
                raw.wins       = wins
                raw.losses     = losses
                raw.pts        = pts
                raw.opp_pts    = opp_pts
                raw.fgm        = fgm
                raw.fga        = fga
                raw.fg3m       = fg3m
                raw.fg3a       = fg3a
                raw.ftm        = ftm
                raw.fta        = fta
                raw.opp_fgm    = opp_fgm
                raw.opp_fga    = opp_fga
                raw.opp_fg3m   = opp_fg3m
                raw.opp_fg3a   = opp_fg3a
                raw.trb        = trb
                raw.opp_trb    = opp_trb
                raw.tov        = tov_n
                raw.opp_tov    = opp_tov
                raw.ast        = ast
                raw.stl        = stl
                raw.blk        = blk

                # Update TeamMetrics
                m = team.metrics
                if m is None:
                    m = TeamMetrics(team_id=team.id)
                    db.add(m)

                if efg_pct          is not None: m.efg_pct          = efg_pct
                if opp_efg_pct      is not None: m.opp_efg_pct      = opp_efg_pct
                if ft_rate          is not None: m.ft_rate          = ft_rate
                if opp_ft_rate      is not None: m.opp_ft_rate      = opp_ft_rate
                if ast_pct          is not None: m.ast_pct          = ast_pct
                if three_pt_rate    is not None: m.three_pt_rate    = three_pt_rate
                if opp_three_pt_rate is not None: m.opp_three_pt_rate = opp_three_pt_rate
                if two_pt_pct       is not None: m.two_pt_pct       = two_pt_pct
                if opp_two_pt_pct   is not None: m.opp_two_pt_pct   = opp_two_pt_pct
                if steal_pct        is not None: m.steal_pct        = steal_pct
                if block_pct        is not None: m.block_pct        = block_pct

            matched.append(our)

        if not args.dry_run:
            db.commit()

        label = "[DRY RUN] " if args.dry_run else ""
        print(f"\n{label}Season {args.season}: {len(matched)} / {len(teams)} teams updated")

        if unmatched:
            print(f"\n  Unmatched ({len(unmatched)}) — add entries to NCAA_TO_OURS:")
            for n in sorted(unmatched):
                print(f"    '{n}'")

    finally:
        db.close()


if __name__ == "__main__":
    main()
