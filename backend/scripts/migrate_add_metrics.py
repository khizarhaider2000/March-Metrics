"""
scripts/migrate_add_metrics.py

Adds the 8 new metric columns to team_metrics and 3 columns to raw_team_stats.
Safe to run multiple times — skips columns that already exist.

Usage:
    cd backend && source .venv/bin/activate
    python -m scripts.migrate_add_metrics                          # local SQLite
    DATABASE_URL="postgresql+psycopg://..." python -m scripts.migrate_add_metrics  # Neon
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import text
from app.db.session import engine

NEW_TEAM_METRICS = [
    "opp_ft_rate       FLOAT",
    "ast_pct           FLOAT",
    "three_pt_rate     FLOAT",
    "opp_three_pt_rate FLOAT",
    "two_pt_pct        FLOAT",
    "opp_two_pt_pct    FLOAT",
    "steal_pct         FLOAT",
    "block_pct         FLOAT",
]

NEW_RAW_STATS = [
    "ast INTEGER",
    "stl INTEGER",
    "blk INTEGER",
]


def add_column(conn, table: str, col_def: str) -> None:
    col_name = col_def.split()[0]
    try:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_def}"))
        print(f"  + {table}.{col_name}")
    except Exception as e:
        msg = str(e).lower()
        if "already exists" in msg or "duplicate column" in msg:
            print(f"  = {table}.{col_name} (already exists, skipped)")
        else:
            raise


def main() -> None:
    with engine.connect() as conn:
        print("Migrating team_metrics …")
        for col in NEW_TEAM_METRICS:
            add_column(conn, "team_metrics", col)

        print("Migrating raw_team_stats …")
        for col in NEW_RAW_STATS:
            add_column(conn, "raw_team_stats", col)

        conn.commit()

    print("\nMigration complete.")


if __name__ == "__main__":
    main()
