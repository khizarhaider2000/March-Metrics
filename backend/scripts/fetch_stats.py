"""
scripts/fetch_stats.py

Fetches real 2025-26 team stats from Sports Reference (free, no login)
and updates TeamMetrics in the database.

Metrics and how they are computed
──────────────────────────────────
adj_o       off_rtg from advanced stats (pts per 100 possessions, unadjusted)
adj_d       opp_pts / opp_poss * 100  (computed from opponent counting stats)
adj_em      adj_o − adj_d  (consistent scale — both pts/100 poss)
tempo       pace (possessions per 40 min)
efg_pct     efg_pct  (decimal, e.g. 0.568)
to_pct      tov_pct / 100  (SR stores as percentage, e.g. 13.3 → 0.133)
orb_pct     orb_pct / 100  (SR stores as percentage, e.g. 38.1 → 0.381)
ft_rate     fta_per_fga_pct  (decimal, e.g. 0.378)
sos         sos from advanced stats
opp_efg_pct (opp_fg + 0.5 * opp_fg3) / opp_fga
opp_to_pct  opp_tov / opp_poss  (decimal)
drb_pct     (opp_missed_fg − opp_orb) / opp_missed_fg

Usage:
    cd backend
    source .venv/bin/activate
    python -m scripts.fetch_stats --season 2026
    python -m scripts.fetch_stats --season 2026 --dry-run
"""

import argparse
import os
import sys
import time

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.models.team import Team, TeamMetrics

BASE = "https://www.sports-reference.com/cbb/seasons/men"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
}

# Sports-Reference name (after stripping "NCAA") → our seed_season.py name
SR_TO_OURS: dict[str, str] = {
    "Saint Mary's (CA)":        "Saint Mary's",
    "Saint Mary's":             "Saint Mary's",
    "Brigham Young":            "BYU",
    "Connecticut":              "UConn",
    "Long Island University":   "LIU",
    "Maryland-Baltimore County":"UMBC",
    "Pennsylvania":             "Penn",
    "Queens (NC)":              "Queens",
    "Southern Methodist":       "SMU",
    "St. John's (NY)":          "St. John's",
    "Texas Christian":          "TCU",
    "Virginia Commonwealth":    "VCU",
}


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


def _strip_ncaa(name: str) -> str:
    return name.removesuffix("NCAA").strip()


def _match(sr_raw: str, our_names: list[str], our_norms: dict[str, str]) -> str | None:
    clean = _strip_ncaa(sr_raw)
    if clean in SR_TO_OURS and SR_TO_OURS[clean] in our_names:
        return SR_TO_OURS[clean]
    n = _norm(clean)
    return our_norms.get(n)


def _fetch(url: str) -> BeautifulSoup:
    print(f"  Fetching {url} …")
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def _parse_table(soup: BeautifulSoup) -> list[dict[str, str]]:
    table = soup.find("table")
    if not table:
        return []
    rows = []
    for tr in table.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        if not cells or all(c.name == "th" for c in cells):
            continue
        row = {c.get("data-stat", ""): c.get_text(strip=True) for c in cells}
        if not row.get("school_name"):
            continue
        rows.append(row)
    return rows


def _f(val: str) -> float | None:
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    yr = args.season

    adv_soup = _fetch(f"{BASE}/{yr}-advanced-school-stats.html")
    time.sleep(4)
    opp_soup = _fetch(f"{BASE}/{yr}-opponent-stats.html")

    adv_rows = _parse_table(adv_soup)
    opp_rows = _parse_table(opp_soup)
    print(f"  Advanced rows: {len(adv_rows)}  |  Opponent rows: {len(opp_rows)}")

    # Index opponent rows by raw SR name (includes "NCAA" suffix for tournament teams)
    opp_by_sr: dict[str, dict[str, str]] = {
        r["school_name"]: r for r in opp_rows if r.get("school_name")
    }

    init_db()
    db = SessionLocal()

    try:
        teams = db.query(Team).filter_by(season=yr).all()
        if not teams:
            print(f"ERROR: no teams for season {yr}. Run seed_season.py first.")
            sys.exit(1)

        our_names  = [t.team_name for t in teams]
        our_norms  = {_norm(n): n for n in our_names}
        team_by_name = {t.team_name: t for t in teams}

        updated: set[str] = set()

        tournament_rows = [r for r in adv_rows if r.get("school_name", "").endswith("NCAA")]
        print(f"  Tournament rows (NCAA suffix): {len(tournament_rows)}")

        for adv in tournament_rows:
            sr_raw   = adv["school_name"]
            our_name = _match(sr_raw, our_names, our_norms)
            if our_name is None:
                continue

            team = team_by_name[our_name]
            if team.metrics is None:
                continue

            m   = team.metrics
            opp = opp_by_sr.get(sr_raw, {})

            # ── Offensive metrics (advanced stats) ────────────────────────────
            off_rtg = _f(adv.get("off_rtg",         ""))  # pts/100 poss
            pace    = _f(adv.get("pace",             ""))  # possessions/40 min
            efg     = _f(adv.get("efg_pct",          ""))  # already decimal
            tov_raw = _f(adv.get("tov_pct",          ""))  # SR stores as %, e.g. 13.3
            orb_raw = _f(adv.get("orb_pct",          ""))  # SR stores as %, e.g. 38.1
            ft      = _f(adv.get("fta_per_fga_pct",  ""))  # already decimal
            sos     = _f(adv.get("sos",              ""))

            if off_rtg is not None: m.adj_o   = round(off_rtg, 1)
            if pace    is not None: m.tempo   = round(pace, 1)
            if efg     is not None: m.efg_pct = round(efg, 4)
            if tov_raw is not None: m.to_pct  = round(tov_raw / 100, 4)
            if orb_raw is not None: m.orb_pct = round(orb_raw / 100, 4)
            if ft      is not None: m.ft_rate = round(ft, 4)
            if sos     is not None: m.sos     = round(sos, 2)

            # ── Defensive metrics (computed from opponent counting stats) ─────
            o_pts  = _f(opp.get("opp_pts",  ""))
            o_fg   = _f(opp.get("opp_fg",   ""))
            o_fg3  = _f(opp.get("opp_fg3",  ""))
            o_fga  = _f(opp.get("opp_fga",  ""))
            o_ft   = _f(opp.get("opp_ft",   ""))
            o_fta  = _f(opp.get("opp_fta",  ""))
            o_orb  = _f(opp.get("opp_orb",  ""))
            o_trb  = _f(opp.get("opp_trb",  ""))
            o_tov  = _f(opp.get("opp_tov",  ""))

            # Opponent possessions = FGA + 0.44*FTA − ORB + TOV
            opp_poss = None
            if o_fga is not None and o_fta is not None and o_orb is not None and o_tov is not None:
                opp_poss = o_fga + 0.44 * o_fta - o_orb + o_tov

            # adj_d = opponent points per 100 possessions
            if o_pts is not None and opp_poss and opp_poss > 0:
                adj_d = round(o_pts / opp_poss * 100, 1)
                m.adj_d = adj_d
                # adj_em = adj_o − adj_d (both in pts/100 poss)
                if off_rtg is not None:
                    m.adj_em = round(off_rtg - adj_d, 2)

            # opp_efg_pct = (opp_FG + 0.5 * opp_3P) / opp_FGA
            if o_fg is not None and o_fg3 is not None and o_fga and o_fga > 0:
                m.opp_efg_pct = round((o_fg + 0.5 * o_fg3) / o_fga, 4)

            # opp_to_pct = opp_TOV / opp_poss  (as decimal fraction)
            if o_tov is not None and opp_poss and opp_poss > 0:
                m.opp_to_pct = round(o_tov / opp_poss, 4)

            # drb_pct = (opp missed FGs − opp ORB) / opp missed FGs
            # = fraction of opponent's missed shots that we grabbed
            if o_fga is not None and o_fg is not None and o_orb is not None:
                opp_missed = o_fga - o_fg
                if opp_missed > 0:
                    m.drb_pct = round((opp_missed - o_orb) / opp_missed, 4)

            if args.dry_run:
                print(
                    f"  [dry] {_strip_ncaa(sr_raw):28s} → {our_name:25s}  "
                    f"adj_em={m.adj_em:+6.1f}  adj_o={m.adj_o:5.1f}  adj_d={m.adj_d:5.1f}  "
                    f"efg={m.efg_pct:.3f}  to={m.to_pct:.3f}  orb={m.orb_pct:.3f}  tempo={m.tempo:.1f}"
                )
            else:
                db.add(m)

            updated.add(our_name)

        if not args.dry_run:
            db.commit()

        label = "[DRY RUN] " if args.dry_run else ""
        print(f"\n{label}Season {yr}:  {len(updated)} / {len(our_names)} teams updated")

        missed = [n for n in our_names if n not in updated]
        if missed:
            print(f"\n  Not matched ({len(missed)}) — still using mock data:")
            for n in sorted(missed):
                print(f"    {n}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
