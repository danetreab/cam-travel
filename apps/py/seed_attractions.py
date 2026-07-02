"""
Seed `attraction` rows from a CSV and upload local photos to MinIO,
mirroring the pattern in apps/backend/graphql/src/uploads/upload.service.ts:

  - filename:        f"{unix_ms}_{sanitized_original}"
  - thumbnail:       f"thumb_{filename}"  (only when image)
  - uploaded_file:   entityType='attraction', entityId=<attraction.id>

Idempotent-ish: an attraction is matched by `google_place_id`; if one
already exists it's reused (no duplicate insert) and we only upload
photos it doesn't already have a row for.

Setup (one-time, from apps/py/):
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt

Env (auto-loaded from ../backend/auth/.env and ../backend/graphql/.env):
    DATABASE_URL
    MINIO_ENDPOINT  MINIO_PORT  MINIO_USE_SSL
    MINIO_ACCESS_KEY  MINIO_SECRET_KEY  MINIO_BUCKET

Usage (from apps/py/):
    .venv/bin/python seed_attractions.py                          # default top50 + photos/
    .venv/bin/python seed_attractions.py phnom_penh_top50.csv photos
    .venv/bin/python seed_attractions.py --dry-run                # don't write anything
    .venv/bin/python seed_attractions.py --province "Siem Reap"   # override province
"""

from __future__ import annotations

import csv
import io
import json
import mimetypes
import os
import re
import sys
import time
import uuid
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from minio import Minio
from PIL import Image

DEFAULT_CSV     = "phnom_penh_top50.csv"
DEFAULT_PHOTO_DIR = "photos"
ENTITY_TYPE     = "attraction"

# Match upload.service.ts: compressed images go in as JPEG; thumbnails are 300px.
COMPRESS_QUALITY = 85
THUMBNAIL_WIDTH  = 300


# --- helpers ------------------------------------------------------------------

def load_env():
    here = Path(__file__).resolve().parent
    for rel in ("../backend/auth/.env", "../backend/graphql/.env"):
        p = (here / rel).resolve()
        if p.exists():
            load_dotenv(p, override=False)


def sanitize_filename(name: str) -> str:
    # Mirror upload.service.ts:sanitizeFilename
    name = re.sub(r"^.*[\\/]", "", name)
    name = re.sub(r"[^a-zA-Z0-9._-]", "_", name)
    return name.lower()


def to_float(x, default=None):
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def to_int(x, default=None):
    try:
        return int(float(x))
    except (TypeError, ValueError):
        return default


def compress_image(raw: bytes) -> bytes:
    img = Image.open(io.BytesIO(raw))
    if img.mode != "RGB":
        img = img.convert("RGB")
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=COMPRESS_QUALITY, optimize=True)
    return out.getvalue()


def make_thumbnail(raw: bytes) -> bytes:
    img = Image.open(io.BytesIO(raw))
    if img.mode != "RGB":
        img = img.convert("RGB")
    w, h = img.size
    if w > THUMBNAIL_WIDTH:
        new_h = int(h * (THUMBNAIL_WIDTH / w))
        img = img.resize((THUMBNAIL_WIDTH, new_h), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=80, optimize=True)
    return out.getvalue()


# --- DB ops -------------------------------------------------------------------

def find_attraction_by_place_id(cur, place_id: str):
    cur.execute(
        'SELECT id FROM attraction WHERE google_place_id = %s LIMIT 1',
        (place_id,),
    )
    row = cur.fetchone()
    return row[0] if row else None


def row_activity_type(row: dict) -> str | None:
    explicit = (row.get("activity_type") or "").strip()
    if explicit:
        return explicit
    activities = (row.get("activities") or "").split(";")
    return (
        activities[0].strip() if activities and activities[0].strip()
        else (row.get("category") or None)
    )


def insert_attraction(cur, row: dict, province: str | None) -> str:
    activity_type = row_activity_type(row)

    aid = str(uuid.uuid4())
    cur.execute(
        """
        INSERT INTO attraction
            (id, name, latitude, longitude, province, activity_type,
             google_place_id, cached_rating, cached_user_ratings_total,
             places_refreshed_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        """,
        (
            aid,
            row["name"],
            to_float(row["lat"]),
            to_float(row["lon"]),
            province,
            activity_type,
            row["google_place_id"],
            to_float(row.get("rating")),
            to_int(row.get("rating_count")),
        ),
    )
    return aid


def insert_uploaded_file(cur, *, filename, original, mimetype, size,
                         has_thumbnail, attraction_id):
    cur.execute(
        """
        INSERT INTO uploaded_file
            (filename, original_filename, mimetype, size, has_thumbnail,
             entity_type, entity_id, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
        """,
        (filename, original, mimetype, size, has_thumbnail,
         ENTITY_TYPE, attraction_id),
    )


def existing_originals_for(cur, attraction_id: str) -> set:
    cur.execute(
        """
        SELECT original_filename FROM uploaded_file
        WHERE entity_type = %s AND entity_id = %s
        """,
        (ENTITY_TYPE, attraction_id),
    )
    return {r[0] for r in cur.fetchall()}


# --- main ---------------------------------------------------------------------

def province_from_csv_name(csv_path: str) -> str | None:
    """Infer a province from the CSV filename, e.g. 'phnom_penh_top50.csv'."""
    stem = Path(csv_path).stem.lower()
    table = {
        "phnom_penh": "Phnom Penh",
        "siem_reap": "Siem Reap",
        "preah_sihanouk": "Preah Sihanouk",
        "sihanoukville": "Preah Sihanouk",
        "battambang": "Battambang",
        "kampot": "Kampot",
        "kep": "Kep",
        "mondulkiri": "Mondulkiri",
        "ratanakiri": "Ratanakiri",
        "koh_kong": "Koh Kong",
    }
    for key, label in table.items():
        if key in stem:
            return label
    return None


def main(csv_path: str, photo_dir: str, dry_run: bool, province: str | None):
    load_env()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("ERROR: DATABASE_URL not set")

    minio_client = Minio(
        endpoint=os.environ["MINIO_ENDPOINT"],
        access_key=os.environ["MINIO_ACCESS_KEY"],
        secret_key=os.environ["MINIO_SECRET_KEY"],
        secure=os.environ.get("MINIO_USE_SSL", "false").lower() == "true",
    )
    bucket = os.environ["MINIO_BUCKET"]

    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    province = province or province_from_csv_name(csv_path)

    print(f"DB:       {db_url.split('@')[-1]}")
    print(f"MinIO:    {os.environ['MINIO_ENDPOINT']}/{bucket}")
    print(f"Rows:     {len(rows)} from {csv_path}")
    print(f"Province: {province or '(none — leave NULL)'}")
    print(f"Mode:     {'DRY RUN' if dry_run else 'WRITE'}")
    print()

    conn = psycopg2.connect(db_url)
    conn.autocommit = False

    inserted_attractions = 0
    reused_attractions = 0
    uploaded_photos = 0
    skipped_photos = 0

    try:
        with conn.cursor() as cur:
            for i, row in enumerate(rows, start=1):
                pid = (row.get("google_place_id") or "").strip()
                name = row.get("name", "")
                if not pid or not name:
                    continue

                existing_id = find_attraction_by_place_id(cur, pid)
                if existing_id:
                    aid = existing_id
                    reused_attractions += 1
                    tag = "reuse"
                else:
                    if dry_run:
                        aid = "<dry-run-uuid>"
                    else:
                        aid = insert_attraction(cur, row, province)
                    inserted_attractions += 1
                    tag = "insert"

                # Photos
                place_photo_dir = Path(photo_dir) / pid
                if not place_photo_dir.exists():
                    print(f"[{i}/{len(rows)}] {tag} {name[:42]:<42}  no photos dir")
                    continue

                photos = sorted(p for p in place_photo_dir.iterdir()
                                if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"))
                if not photos:
                    print(f"[{i}/{len(rows)}] {tag} {name[:42]:<42}  empty dir")
                    continue

                already = set() if dry_run else existing_originals_for(cur, aid)

                this_uploaded = 0
                this_skipped = 0
                for p in photos:
                    if p.name in already:
                        this_skipped += 1
                        continue

                    raw = p.read_bytes()
                    compressed = compress_image(raw)
                    thumb = make_thumbnail(raw)

                    ts = int(time.time() * 1000)
                    filename = f"{ts}_{sanitize_filename(p.name)}"
                    thumb_name = f"thumb_{filename}"
                    mimetype = mimetypes.guess_type(p.name)[0] or "image/jpeg"
                    # We compress to JPEG, so override the upload mimetype
                    upload_mime = "image/jpeg"

                    if not dry_run:
                        minio_client.put_object(
                            bucket, filename, io.BytesIO(compressed),
                            length=len(compressed),
                            content_type=upload_mime,
                        )
                        minio_client.put_object(
                            bucket, thumb_name, io.BytesIO(thumb),
                            length=len(thumb),
                            content_type="image/jpeg",
                        )
                        insert_uploaded_file(
                            cur,
                            filename=filename,
                            original=p.name,
                            mimetype=upload_mime,
                            size=len(compressed),
                            has_thumbnail=True,
                            attraction_id=aid,
                        )
                    this_uploaded += 1
                    # Tiny sleep to keep timestamps distinct
                    time.sleep(0.002)

                uploaded_photos += this_uploaded
                skipped_photos += this_skipped
                print(f"[{i}/{len(rows)}] {tag} {name[:42]:<42}  +{this_uploaded} (skip {this_skipped})")

        if dry_run:
            print("\nDRY RUN — rolling back.")
            conn.rollback()
        else:
            conn.commit()
            print("\nCommitted.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print()
    print(f"attractions inserted: {inserted_attractions}")
    print(f"attractions reused:   {reused_attractions}")
    print(f"photos uploaded:      {uploaded_photos}")
    print(f"photos skipped:       {skipped_photos}")


if __name__ == "__main__":
    raw = sys.argv[1:]
    dry = "--dry-run" in raw
    province = None
    if "--province" in raw:
        i = raw.index("--province")
        province = raw[i + 1] if i + 1 < len(raw) else None
        raw = raw[:i] + raw[i + 2 :]
    positional = [a for a in raw if a not in ("--dry-run",)]
    csv_path  = positional[0] if len(positional) > 0 else DEFAULT_CSV
    photo_dir = positional[1] if len(positional) > 1 else DEFAULT_PHOTO_DIR
    main(csv_path, photo_dir, dry_run=dry, province=province)
