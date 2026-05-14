"""
Delete attractions whose name matches a substring pattern (case-insensitive),
plus their uploaded_file rows and MinIO objects (main + thumbnail).

Defaults: matches "casino" and "club" — the obvious gambling / nightlife noise
the Google Places fetch picked up. Override with --patterns if you need to
target something else.

`saved_attraction` rows have ON DELETE CASCADE so they clean up automatically.
`uploaded_file` is a polymorphic ref (entity_type + entity_id, no FK), so we
delete it explicitly before deleting the attraction row.

DB writes run in a single transaction per invocation, so a failure mid-run
rolls back cleanly. MinIO deletes happen *after* the commit (object-store
deletes aren't transactional). If a MinIO delete fails, the attraction is
gone but the object becomes an orphan — log and continue.

Env (auto-loaded from ../backend/auth/.env and ../backend/graphql/.env):
    DATABASE_URL
    MINIO_ENDPOINT  MINIO_USE_SSL
    MINIO_ACCESS_KEY  MINIO_SECRET_KEY  MINIO_BUCKET

Usage (from apps/py/):
    .venv/bin/python delete_attractions_by_name.py                 # dry-run, default patterns
    .venv/bin/python delete_attractions_by_name.py --confirm       # actually delete
    .venv/bin/python delete_attractions_by_name.py --patterns casino,KTV,karaoke
    .venv/bin/python delete_attractions_by_name.py --keep-files    # delete attractions only, keep photos
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from minio import Minio
from minio.error import S3Error


ENTITY_TYPE = "attraction"
DEFAULT_PATTERNS = ["casino", "club"]


def load_env() -> None:
    here = Path(__file__).resolve().parent
    for rel in ("../backend/auth/.env", "../backend/graphql/.env"):
        p = (here / rel).resolve()
        if p.exists():
            load_dotenv(p, override=False)


def find_matching_attractions(cur, patterns: list[str]) -> list[tuple]:
    """Return [(id, name, province, google_place_id), ...] for matches."""
    clauses = " OR ".join(["name ILIKE %s"] * len(patterns))
    params = [f"%{p}%" for p in patterns]
    cur.execute(
        f"""
        SELECT id, name, province, google_place_id
        FROM attraction
        WHERE {clauses}
        ORDER BY province NULLS LAST, name
        """,
        params,
    )
    return cur.fetchall()


def find_uploaded_files(cur, attraction_ids: list[str]) -> list[tuple]:
    """Return [(attraction_id, filename, has_thumbnail), ...]."""
    if not attraction_ids:
        return []
    cur.execute(
        """
        SELECT entity_id, filename, has_thumbnail
        FROM uploaded_file
        WHERE entity_type = %s AND entity_id = ANY(%s)
        """,
        (ENTITY_TYPE, attraction_ids),
    )
    return cur.fetchall()


def delete_minio_objects(client: Minio, bucket: str, files: list[tuple]) -> tuple[int, list[str]]:
    """Best-effort delete. Returns (deleted_count, list_of_failure_messages)."""
    deleted = 0
    failures: list[str] = []
    for _aid, filename, has_thumbnail in files:
        keys = [filename]
        if has_thumbnail:
            keys.append(f"thumb_{filename}")
        for key in keys:
            try:
                client.remove_object(bucket, key)
                deleted += 1
            except S3Error as e:
                # NoSuchKey is fine — already gone.
                if getattr(e, "code", "") == "NoSuchKey":
                    continue
                failures.append(f"{key}: {e}")
    return deleted, failures


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Delete attractions whose name matches a substring pattern.",
    )
    ap.add_argument(
        "--patterns",
        default=",".join(DEFAULT_PATTERNS),
        help=f"Comma-separated substrings (case-insensitive). Default: {','.join(DEFAULT_PATTERNS)}",
    )
    ap.add_argument(
        "--confirm",
        action="store_true",
        help="Actually delete. Without this flag the script is dry-run only.",
    )
    ap.add_argument(
        "--keep-files",
        action="store_true",
        help="Delete attraction rows only; leave uploaded_file rows and MinIO objects in place.",
    )
    args = ap.parse_args()

    patterns = [p.strip() for p in args.patterns.split(",") if p.strip()]
    if not patterns:
        sys.exit("ERROR: --patterns is empty")

    load_env()
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("ERROR: DATABASE_URL not set")

    minio_client = None
    bucket = None
    if not args.keep_files:
        for var in ("MINIO_ENDPOINT", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY", "MINIO_BUCKET"):
            if not os.environ.get(var):
                sys.exit(f"ERROR: {var} not set (needed unless --keep-files)")
        minio_client = Minio(
            endpoint=os.environ["MINIO_ENDPOINT"],
            access_key=os.environ["MINIO_ACCESS_KEY"],
            secret_key=os.environ["MINIO_SECRET_KEY"],
            secure=os.environ.get("MINIO_USE_SSL", "false").lower() == "true",
        )
        bucket = os.environ["MINIO_BUCKET"]

    print(f"Patterns: {patterns}")
    print(f"Mode:     {'DELETE' if args.confirm else 'DRY-RUN'} "
          f"({'keep' if args.keep_files else 'delete'} uploaded_file + MinIO)")
    print(f"DB:       {db_url.split('@')[-1]}")
    if bucket:
        print(f"MinIO:    {os.environ['MINIO_ENDPOINT']}/{bucket}")
    print()

    conn = psycopg2.connect(db_url, connect_timeout=30)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            matches = find_matching_attractions(cur, patterns)
            if not matches:
                print("No matching attractions. Nothing to do.")
                return 0

            print(f"Matching attractions: {len(matches)}")
            print(f"{'province':<22} {'name':<60} id")
            print("-" * 110)
            for aid, name, province, _pid in matches:
                print(f"{(province or '<no-province>'):<22} {(name or '')[:58]:<60} {aid}")

            attraction_ids = [m[0] for m in matches]
            files = find_uploaded_files(cur, attraction_ids)
            print(f"\nAssociated uploaded_file rows: {len(files)}")
            if files and not args.keep_files:
                thumbs = sum(1 for _a, _f, h in files if h)
                print(f"  (will also remove {len(files) + thumbs} MinIO objects: "
                      f"{len(files)} files + {thumbs} thumbnails)")

            if not args.confirm:
                print("\nDRY-RUN — nothing deleted. Re-run with --confirm to actually delete.")
                return 0

            # Real delete: do DB work in one transaction, then MinIO cleanup.
            if not args.keep_files:
                cur.execute(
                    """
                    DELETE FROM uploaded_file
                    WHERE entity_type = %s AND entity_id = ANY(%s)
                    """,
                    (ENTITY_TYPE, attraction_ids),
                )
                deleted_files = cur.rowcount
            else:
                deleted_files = 0

            cur.execute(
                "DELETE FROM attraction WHERE id = ANY(%s)",
                (attraction_ids,),
            )
            deleted_attractions = cur.rowcount

        conn.commit()
        print(f"\nDB committed:")
        print(f"  attractions deleted:   {deleted_attractions}")
        print(f"  uploaded_file deleted: {deleted_files}")

        if files and not args.keep_files:
            print(f"\nRemoving MinIO objects...")
            deleted_objs, failures = delete_minio_objects(minio_client, bucket, files)
            print(f"  MinIO objects deleted: {deleted_objs}")
            if failures:
                print(f"  MinIO failures ({len(failures)}) — orphans left in bucket:")
                for f in failures[:20]:
                    print(f"    - {f}")
                if len(failures) > 20:
                    print(f"    ... and {len(failures) - 20} more")

        return 0
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
