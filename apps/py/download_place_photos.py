"""
Download place photos from Google Places API (v1) for every row in a CSV.

For each place:
  1. Fetch Place Details with the `photos` field mask to get photo resource names.
  2. Call the Place Photos endpoint to download each image.
  3. Save into  <out_dir>/<google_place_id>/photo_01.jpg, photo_02.jpg, ...

Re-running is safe: places whose folder already has the requested number
of photos are skipped.

Usage:
    export GOOGLE_PLACES_API_KEY=AIza...
    python3 download_place_photos.py                       # defaults below
    python3 download_place_photos.py phnom_penh_top50.csv photos 5

Cost note (verify current Google pricing):
    Place Details (basic): ~$17 / 1000 calls
    Place Photos:          ~$7  / 1000 calls
    50 places * (1 details + 5 photos) ≈ $0.85 + $1.75 ≈ $2.60 per full run.
"""

import csv
import os
import sys
import time
import requests

API_KEY = "AIzaSyAA7KX1zegLnNZDvsLPez59_3SlzdyhJqI"
if not API_KEY:
    sys.exit("ERROR: set GOOGLE_PLACES_API_KEY environment variable")

DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"
PHOTO_URL   = "https://places.googleapis.com/v1/{photo_name}/media"

DEFAULT_CSV       = "phnom_penh_top50.csv"
DEFAULT_OUT_DIR   = "photos"
DEFAULT_PER_PLACE = 5
PHOTO_MAX_WIDTH   = 1600  # px


def get_photo_names(place_id):
    """Return a list of photo resource names (e.g. 'places/XXX/photos/YYY')."""
    headers = {
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "photos",
    }
    try:
        r = requests.get(DETAILS_URL.format(place_id=place_id),
                         headers=headers, timeout=30)
        if r.status_code == 429:
            time.sleep(5)
            r = requests.get(DETAILS_URL.format(place_id=place_id),
                             headers=headers, timeout=30)
        r.raise_for_status()
        return [p["name"] for p in (r.json().get("photos") or []) if p.get("name")]
    except requests.RequestException as e:
        print(f"  details error for {place_id}: {e}", file=sys.stderr)
        return []


def download_photo(photo_name, dest_path):
    """Fetch one photo and write it to dest_path. Returns True on success."""
    params = {"maxWidthPx": PHOTO_MAX_WIDTH, "key": API_KEY}
    try:
        r = requests.get(PHOTO_URL.format(photo_name=photo_name),
                         params=params, timeout=60, stream=True)
        if r.status_code == 429:
            time.sleep(5)
            r = requests.get(PHOTO_URL.format(photo_name=photo_name),
                             params=params, timeout=60, stream=True)
        r.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=64 * 1024):
                if chunk:
                    f.write(chunk)
        return True
    except requests.RequestException as e:
        print(f"  photo error: {e}", file=sys.stderr)
        return False


def main(csv_path, out_dir, per_place):
    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    os.makedirs(out_dir, exist_ok=True)
    total_downloaded = 0
    total_skipped = 0

    for i, row in enumerate(rows, start=1):
        pid = row.get("google_place_id", "").strip()
        name = row.get("name", "")
        if not pid:
            continue

        place_dir = os.path.join(out_dir, pid)
        os.makedirs(place_dir, exist_ok=True)

        existing = sorted(p for p in os.listdir(place_dir)
                          if p.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
        if len(existing) >= per_place:
            print(f"[{i}/{len(rows)}] {name[:50]:<50}  skip ({len(existing)} photos)",
                  file=sys.stderr)
            total_skipped += 1
            continue

        photo_names = get_photo_names(pid)[:per_place]
        if not photo_names:
            print(f"[{i}/{len(rows)}] {name[:50]:<50}  no photos available",
                  file=sys.stderr)
            continue

        got = 0
        for idx, pn in enumerate(photo_names, start=1):
            dest = os.path.join(place_dir, f"photo_{idx:02d}.jpg")
            if os.path.exists(dest):
                continue
            if download_photo(pn, dest):
                got += 1
                total_downloaded += 1
            time.sleep(0.05)

        print(f"[{i}/{len(rows)}] {name[:50]:<50}  +{got} photos",
              file=sys.stderr)

    print(f"\nDone. downloaded={total_downloaded} skipped_places={total_skipped}",
          file=sys.stderr)


if __name__ == "__main__":
    csv_path  = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV
    out_dir   = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT_DIR
    per_place = int(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_PER_PLACE
    main(csv_path, out_dir, per_place)
