"""
Copy seeded coffee attractions and their uploaded_file rows from the dev DB to
the production DB. MinIO is shared, so this preserves existing object filenames
instead of re-uploading photo binaries.

Usage from apps/py:
    .venv/bin/python migrate_coffee_to_production.py --dry-run
    .venv/bin/python migrate_coffee_to_production.py
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import dotenv_values


COFFEE_ACTIVITY_TYPE = "coffee"
ENTITY_TYPE = "attraction"

ATTRACTION_COLUMNS = [
    "id",
    "name",
    "description",
    "latitude",
    "longitude",
    "province",
    "activity_type",
    "duration_minutes",
    "difficulty",
    "google_place_id",
    "cached_rating",
    "cached_user_ratings_total",
    "cached_photos",
    "places_refreshed_at",
    "created_at",
    "updated_at",
]

FILE_COLUMNS = [
    "id",
    "filename",
    "original_filename",
    "mimetype",
    "size",
    "has_thumbnail",
    "entity_type",
    "entity_id",
    "related_type",
    "related_id",
    "uploaded_by_id",
    "created_at",
    "updated_at",
]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def env_value(path: Path, key: str) -> str:
    value = dotenv_values(path).get(key)
    if not value:
        raise SystemExit(f"ERROR: {key} not found in {path}")
    return value


def connection(url: str):
    return psycopg2.connect(
        url,
        connect_timeout=30,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
    )


def fetch_dev_attractions(cur) -> list[dict]:
    cols = ", ".join(ATTRACTION_COLUMNS)
    cur.execute(
        f"""
        SELECT {cols}
        FROM attraction
        WHERE activity_type = %s
        ORDER BY province NULLS LAST, name
        """,
        (COFFEE_ACTIVITY_TYPE,),
    )
    return [dict(row) for row in cur.fetchall()]


def find_prod_attraction_id(cur, row: dict) -> str | None:
    google_place_id = row.get("google_place_id")
    if google_place_id:
        cur.execute(
            "SELECT id FROM attraction WHERE google_place_id = %s LIMIT 1",
            (google_place_id,),
        )
        found = cur.fetchone()
        if found:
            return found["id"]

    cur.execute("SELECT id FROM attraction WHERE id = %s LIMIT 1", (row["id"],))
    found = cur.fetchone()
    return found["id"] if found else None


def upsert_attraction(cur, row: dict) -> tuple[str, bool]:
    existing_id = find_prod_attraction_id(cur, row)
    values = [row[c] for c in ATTRACTION_COLUMNS]
    if not existing_id:
        placeholders = ", ".join(["%s"] * len(ATTRACTION_COLUMNS))
        cols = ", ".join(ATTRACTION_COLUMNS)
        cur.execute(
            f"INSERT INTO attraction ({cols}) VALUES ({placeholders})",
            values,
        )
        return row["id"], True

    update_columns = [c for c in ATTRACTION_COLUMNS if c != "id"]
    assignments = ", ".join(f"{c} = %s" for c in update_columns)
    cur.execute(
        f"UPDATE attraction SET {assignments} WHERE id = %s",
        [row[c] for c in update_columns] + [existing_id],
    )
    return existing_id, False


def fetch_dev_files(cur, dev_attraction_ids: list[str]) -> list[dict]:
    if not dev_attraction_ids:
        return []
    cols = ", ".join(FILE_COLUMNS)
    cur.execute(
        f"""
        SELECT {cols}
        FROM uploaded_file
        WHERE entity_type = %s
          AND entity_id = ANY(%s)
        ORDER BY entity_id, original_filename, filename
        """,
        (ENTITY_TYPE, dev_attraction_ids),
    )
    return [dict(row) for row in cur.fetchall()]


def prod_file_exists(cur, file_row: dict, prod_entity_id: str) -> bool:
    cur.execute(
        """
        SELECT 1
        FROM uploaded_file
        WHERE entity_type = %s
          AND entity_id = %s
          AND filename = %s
        LIMIT 1
        """,
        (ENTITY_TYPE, prod_entity_id, file_row["filename"]),
    )
    return cur.fetchone() is not None


def insert_file(cur, file_row: dict, prod_entity_id: str) -> bool:
    if prod_file_exists(cur, file_row, prod_entity_id):
        return False

    row = dict(file_row)
    row["entity_id"] = prod_entity_id
    cols = ", ".join(FILE_COLUMNS)
    placeholders = ", ".join(["%s"] * len(FILE_COLUMNS))
    cur.execute(
        f"INSERT INTO uploaded_file ({cols}) VALUES ({placeholders})",
        [row[c] for c in FILE_COLUMNS],
    )
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    root = repo_root()
    dev_url = env_value(root / "apps/backend/graphql/.env", "DATABASE_URL")
    prod_url = env_value(root / ".env.production", "DATABASE_URL")

    dev = connection(dev_url)
    prod = connection(prod_url)
    prod.autocommit = False

    inserted_attractions = 0
    updated_attractions = 0
    inserted_files = 0
    skipped_files = 0

    try:
        with dev.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as dev_cur:
            with prod.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as prod_cur:
                attractions = fetch_dev_attractions(dev_cur)
                id_map: dict[str, str] = {}
                for row in attractions:
                    prod_id, inserted = upsert_attraction(prod_cur, row)
                    id_map[row["id"]] = prod_id
                    if inserted:
                        inserted_attractions += 1
                    else:
                        updated_attractions += 1

                files = fetch_dev_files(dev_cur, list(id_map.keys()))
                for file_row in files:
                    prod_entity_id = id_map.get(file_row["entity_id"])
                    if not prod_entity_id:
                        continue
                    if insert_file(prod_cur, file_row, prod_entity_id):
                        inserted_files += 1
                    else:
                        skipped_files += 1

        if args.dry_run:
            prod.rollback()
        else:
            prod.commit()
    except Exception:
        prod.rollback()
        raise
    finally:
        dev.close()
        prod.close()

    mode = "DRY RUN rolled back" if args.dry_run else "Committed"
    print(mode)
    print(f"coffee attractions inserted: {inserted_attractions}")
    print(f"coffee attractions updated:  {updated_attractions}")
    print(f"photo records inserted:      {inserted_files}")
    print(f"photo records skipped:       {skipped_files}")


if __name__ == "__main__":
    main()
