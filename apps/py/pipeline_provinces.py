"""
End-to-end pipeline: top-50 attractions for every Cambodia province.

For each province, runs four phases:
    1. fetch  — Google Places Nearby Search across categories
    2. rank   — Bayesian filter to the top N
    3. photos — Place Details + Place Photos download to ./photos/<place_id>/
    4. seed   — insert `attraction` rows + upload images to MinIO + insert
                `uploaded_file` rows (mirrors apps/py/seed_attractions.py)

Re-runnable: each phase is idempotent (writes per-province CSVs, skips
already-downloaded photos, dedupes on google_place_id in the DB).

Setup (one-time, from apps/py/):
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt

Env (auto-loaded from ../backend/auth/.env and ../backend/graphql/.env):
    DATABASE_URL
    MINIO_ENDPOINT  MINIO_PORT  MINIO_USE_SSL
    MINIO_ACCESS_KEY  MINIO_SECRET_KEY  MINIO_BUCKET

Usage (from apps/py/):
    .venv/bin/python pipeline_provinces.py                       # all provinces
    .venv/bin/python pipeline_provinces.py --province "Kampot"   # one province
    .venv/bin/python pipeline_provinces.py --provinces "Kampot,Kep"
    .venv/bin/python pipeline_provinces.py --coffee-only --traveler-coffee-provinces
    .venv/bin/python pipeline_provinces.py --skip-fetch          # use existing CSV
    .venv/bin/python pipeline_provinces.py --skip-photos
    .venv/bin/python pipeline_provinces.py --skip-seed
    .venv/bin/python pipeline_provinces.py --dry-run             # no DB / MinIO writes
    .venv/bin/python pipeline_provinces.py --top 50 --photos-per-place 5

Cost estimate (Google Places API v1, verify current pricing):
    Per province: ~15 categories * ~1-6 cells = 15-90 Nearby Search calls
    + 50 Place Details + ~250 photo downloads. Provinces with many
    sub-cells (Siem Reap, Koh Kong, Mondulkiri, Ratanakiri) cost more
    because adventure / rural areas need extra coverage circles.
    Roughly $1-5 per province, ~$40-120 to do all 25 provinces from scratch.
"""

from __future__ import annotations

import argparse
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
from typing import Iterable

import psycopg2
import requests
from dotenv import load_dotenv
from minio import Minio
from PIL import Image


# --- config -------------------------------------------------------------------

API_KEY = "AIzaSyAA7KX1zegLnNZDvsLPez59_3SlzdyhJqI"

PLACES_BASE = "https://places.googleapis.com/v1"
NEARBY_URL  = f"{PLACES_BASE}/places:searchNearby"
DETAILS_URL = f"{PLACES_BASE}/places/{{place_id}}"
PHOTO_URL   = f"{PLACES_BASE}/{{photo_name}}/media"

ENTITY_TYPE        = "attraction"
COMPRESS_QUALITY   = 85
THUMBNAIL_WIDTH    = 300
PHOTO_MAX_WIDTH_PX = 1600

# Filter thresholds for the Bayesian ranker.
MIN_RATING   = 4.0
MIN_REVIEWS  = 20    # rural adventure spots (waterfalls, NPs, remote temples)
                     # rarely have >50 Google reviews even when worth visiting
PRIOR_WEIGHT = 500   # bigger -> more trust in popular places when ranking

# Categories — same set as fetch_siem_reap_places.py.
CATEGORIES = [
    "tourist_attraction",
    "museum",
    "historical_landmark",
    "park",
    "art_gallery",
    "hindu_temple",
    "buddhist_temple",
    "church",
    "mosque",
    "zoo",
    "aquarium",
    "amusement_park",
    "stadium",
    "night_club",
    "shopping_mall",
]

COFFEE_PLACE_TYPES = [
    "coffee_shop",
    "cafe",
]

TRAVELER_COFFEE_PROVINCES = [
    "Kampot",
    "Siem Reap",
    "Phnom Penh",
    "Preah Sihanouk",
    "Kep",
    "Battambang",
]

PROVINCE_ALIASES = {
    "sihanoukville": "Preah Sihanouk",
    "preah_sihanoukville": "Preah Sihanouk",
    "preah_sihanouk": "Preah Sihanouk",
}

NEARBY_FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.types",
    "places.primaryType",
    "places.primaryTypeDisplayName",
    "places.rating",
    "places.userRatingCount",
    "places.priceLevel",
    "places.businessStatus",
    "places.websiteUri",
    "places.googleMapsUri",
])

# 25 provinces of Cambodia. Each entry = (label, [cells]) where each cell is
# (sub_label, lat, lng, radius_m). Most provinces fit in one 50km circle;
# the dense / important ones get extra cells.
#
# Centres are rough provincial-capital coordinates. Radii are conservative
# (Google Nearby Search caps radius at 50_000m).
PROVINCES: list[tuple[str, list[tuple[str, float, float, int]]]] = [
    ("Banteay Meanchey", [
        ("Sisophon",              13.5859, 102.9740, 50000),
        ("Banteay Chhmar temple", 14.0739, 103.0950, 25000),
        ("Poipet border",         13.6580, 102.5560, 25000),
    ]),
    ("Battambang", [
        ("Battambang town",       13.0957, 103.2022, 30000),
        ("Banan / outlying",      13.0040, 103.0860, 30000),
        ("Phnom Sampeau",         13.0556, 103.0980, 15000),
        ("Bamboo train / Ek Phnom",13.1620, 103.1740, 15000),
    ]),
    ("Kampong Cham", [
        ("Kampong Cham",          11.9934, 105.4636, 50000),
        ("Phnom Pros / Phnom Srei",12.0700, 105.4200, 15000),
        ("Han Chey / Mekong",     12.0860, 105.4660, 20000),
    ]),
    ("Kampong Chhnang", [
        ("Kampong Chhnang",       12.2505, 104.6660, 50000),
        ("Tonle Sap floating villages",12.3580, 104.6420, 20000),
        ("Phnom Santuk approach", 12.0900, 104.7800, 25000),
    ]),
    ("Kampong Speu", [
        ("Kampong Speu",          11.4530, 104.5209, 50000),
        ("Kirirom National Park", 11.3236, 104.0500, 30000),
        ("Mount Aural area",      12.0250, 104.1700, 50000),
    ]),
    ("Kampong Thom", [
        ("Kampong Thom",          12.7111, 104.8887, 50000),
        ("Sambor Prei Kuk",       12.8730, 105.0470, 30000),
        ("Prasat Andet / Stoung", 12.5900, 104.6800, 25000),
    ]),
    ("Kampot", [
        ("Kampot town",           10.6104, 104.1810, 30000),
        ("Bokor National Park",   10.6510, 104.0270, 30000),
        ("Pepper farms / La Plantation",10.6360, 104.2470, 15000),
        ("Phnom Chhnork caves",   10.6570, 104.3050, 10000),
    ]),
    ("Kandal", [
        ("Ta Khmau",              11.4870, 104.9410, 40000),
        ("Koh Dach silk island",  11.6280, 104.9450, 10000),
        ("Phnom Tamao area",      11.2950, 104.7900, 20000),
    ]),
    ("Kep", [
        ("Kep town",              10.4830, 104.3163, 20000),
        ("Kep National Park",     10.4970, 104.3300, 8000),
        ("Rabbit Island / Koh Tonsay",10.4530, 104.3760, 8000),
    ]),
    ("Koh Kong", [
        ("Koh Kong town",         11.6153, 102.9836, 40000),
        ("Cardamom mountains",    11.7300, 103.4500, 50000),
        ("Tatai waterfall / river",11.5670, 103.1340, 20000),
        ("Areng valley",          11.5300, 103.5100, 40000),
        ("Koh Kong island",       11.3380, 103.0500, 25000),
        ("Botum Sakor National Park",11.1660, 103.4200, 50000),
    ]),
    ("Kratie", [
        ("Kratie town",           12.4880, 106.0188, 50000),
        ("Kampi dolphin pool",    12.6300, 106.0250, 15000),
        ("Koh Trong island",      12.4630, 106.0030, 10000),
        ("Sambor / Mekong north", 12.7720, 106.0220, 25000),
    ]),
    ("Mondulkiri", [
        ("Sen Monorom",           12.4540, 107.1900, 40000),
        ("North Mondulkiri",      12.7879, 107.1006, 50000),
        ("Bou Sra waterfall",     12.5680, 107.4630, 25000),
        ("Sea Forest / Mereuch",  12.3700, 107.1300, 40000),
        ("Elephant Valley Project",12.4870, 107.1380, 15000),
        ("Dak Dam / Vietnam border",12.3960, 107.3360, 25000),
    ]),
    ("Oddar Meanchey", [
        ("Samraong",              14.1810, 103.5111, 50000),
        ("Anlong Veng / Dangrek", 14.2390, 104.0820, 30000),
        ("Ta Mok lake",           14.2390, 104.0950, 10000),
    ]),
    ("Pailin", [
        ("Pailin town",           12.8489, 102.6093, 30000),
        ("Phnom Yat",             12.8530, 102.6090, 8000),
    ]),
    ("Phnom Penh", [
        ("Daun Penh / Riverside",  11.5680, 104.9300, 2500),
        ("Chamkarmon / BKK",       11.5450, 104.9220, 2500),
        ("Toul Kork",              11.5750, 104.8950, 2500),
        ("7 Makara / Olympic",     11.5550, 104.9080, 2000),
        ("Mean Chey",              11.5180, 104.9100, 3000),
        ("Russey Keo",             11.6050, 104.9100, 3000),
        ("Sen Sok",                11.5950, 104.8700, 3000),
        ("Pou Senchey",            11.5400, 104.8500, 3500),
        ("Chbar Ampov / east bank",11.5400, 104.9550, 3000),
        ("Chroy Changvar",         11.5950, 104.9450, 2500),
        ("Diamond Island / south", 11.5400, 104.9350, 1500),
        ("Stueng Mean Chey",       11.5250, 104.8850, 3000),
        ("Boeung Keng Kang",       11.5500, 104.9270, 1500),
        ("Phnom Penh airport",     11.5500, 104.8470, 2500),
    ]),
    ("Preah Sihanouk", [
        ("Sihanoukville",         10.6253, 103.5224, 25000),
        ("Otres / Ream",          10.5780, 103.6280, 20000),
        ("Koh Rong",              10.7220, 103.2400, 25000),
        ("Koh Rong Samloem",      10.6020, 103.3140, 15000),
        ("Ream National Park",    10.5170, 103.6390, 20000),
        ("Kbal Chhay waterfall",  10.7080, 103.6790, 10000),
    ]),
    ("Preah Vihear", [
        ("Tbeng Meanchey",        13.7903, 104.9810, 50000),
        ("Preah Vihear temple",   14.3870, 104.6800, 30000),
        ("Koh Ker temple complex",13.7833, 104.5333, 20000),
        ("Prasat Preah Khan of Kompong Svay",13.4290, 105.0470, 20000),
    ]),
    ("Pursat", [
        ("Pursat town",           12.5388, 103.9192, 50000),
        ("Kompong Luong floating village",12.5710, 104.2160, 15000),
        ("Cardamom foothills west",12.2500, 103.4000, 50000),
        ("Phnom Aural approach",  12.0250, 104.1300, 30000),
    ]),
    ("Prey Veng", [
        ("Prey Veng town",        11.4869, 105.3252, 50000),
        ("Ba Phnom",              11.2900, 105.5460, 15000),
        ("Neak Loeung / Mekong",  11.2620, 105.2780, 20000),
    ]),
    ("Ratanakiri", [
        ("Banlung",               13.7395, 106.9873, 30000),
        ("Virachey area",         13.9000, 107.1500, 50000),
        ("Yeak Laom Lake",        13.7280, 107.0070, 8000),
        ("Ka Chanh waterfall",    13.7270, 107.0420, 8000),
        ("Bokeo / gem mines",     13.7370, 107.2160, 20000),
        ("Lumphat / Sesan",       13.5060, 106.9810, 25000),
    ]),
    ("Siem Reap", [
        ("Town centre",           13.3550, 103.8550, 2500),
        ("Wat Bo / Riverside",    13.3580, 103.8650, 2000),
        ("Sok San Rd",            13.3550, 103.8400, 2500),
        ("Charles de Gaulle",     13.3800, 103.8580, 2500),
        ("Angkor Wat",            13.4125, 103.8670, 2000),
        ("Angkor Thom",           13.4413, 103.8587, 3000),
        ("Small circuit",         13.4350, 103.8900, 3000),
        ("Grand circuit",         13.4650, 103.8780, 3000),
        ("Banteay Srei",          13.5985, 103.9628, 5000),
        ("Roluos group",          13.3370, 103.9716, 3000),
        ("Tonle Sap",             13.2700, 103.8350, 5000),
        ("Phnom Kulen",           13.5773, 104.1183, 5000),
        ("Beng Mealea",           13.4756, 104.2375, 5000),
    ]),
    ("Stung Treng", [
        ("Stung Treng town",      13.5258, 105.9683, 50000),
        ("Anlong Cheuteal dolphins",13.9170, 105.9670, 20000),
        ("Mekong Flooded Forest", 13.8200, 106.0500, 30000),
        ("Siem Pang / Sekong",    14.1170, 106.3830, 50000),
    ]),
    ("Svay Rieng", [
        ("Svay Rieng town",       11.0879, 105.7993, 50000),
        ("Bavet border",          11.0930, 106.1700, 25000),
    ]),
    ("Takeo", [
        ("Takeo town",            10.9909, 104.7855, 40000),
        ("Phnom Chisor",          11.2630, 104.7800, 15000),
        ("Phnom Da / Angkor Borei",10.8910, 104.8330, 15000),
        ("Tonle Bati",            11.3680, 104.8420, 10000),
    ]),
    ("Tboung Khmum", [
        ("Suong",                 11.9000, 105.6886, 50000),
        ("Memot rubber plantations",11.8190, 106.1740, 30000),
        ("Krek / Vietnam border", 11.7440, 105.9740, 25000),
    ]),
]


# --- helpers ------------------------------------------------------------------

def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


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


def sanitize_filename(name: str) -> str:
    name = re.sub(r"^.*[\\/]", "", name)
    name = re.sub(r"[^a-zA-Z0-9._-]", "_", name)
    return name.lower()


# Cambodia bounding box — only used as a fallback when address is missing.
# Border provinces with large radii (Svay Rieng, Tboung Khmum, Prey Veng,
# Takeo, Pailin, Banteay Meanchey, Oddar Meanchey) can return Vietnamese /
# Thai / Lao places, so we drop anything that isn't clearly in Cambodia.
CAMBODIA_LAT_MIN, CAMBODIA_LAT_MAX = 10.0, 14.8
CAMBODIA_LON_MIN, CAMBODIA_LON_MAX = 102.3, 107.7

# Country markers — case-insensitive substring match against formattedAddress.
CAMBODIA_MARKERS = ("cambodia", "កម្ពុជា")


def is_in_cambodia(addr: str | None, lat=None, lon=None) -> bool:
    """True if the place is in Cambodia.

    Primary check: the formatted address contains a Cambodia country marker
    in English ("Cambodia") or Khmer ("កម្ពុជា"). If the address is missing
    or doesn't include a country (rare), fall back to a bounding-box test
    on lat/lon. Anything that fails both checks is treated as foreign.
    """
    s = (addr or "")
    sl = s.lower()
    if any(m in sl or m in s for m in CAMBODIA_MARKERS):
        return True
    if s.strip():
        # Address present but no Cambodia marker -> definitely foreign.
        return False
    fl, fo = to_float(lat), to_float(lon)
    if fl is None or fo is None:
        return False
    return (CAMBODIA_LAT_MIN <= fl <= CAMBODIA_LAT_MAX
            and CAMBODIA_LON_MIN <= fo <= CAMBODIA_LON_MAX)


def load_env():
    here = Path(__file__).resolve().parent
    for rel in ("../backend/auth/.env", "../backend/graphql/.env"):
        p = (here / rel).resolve()
        if p.exists():
            load_dotenv(p, override=False)


# --- phase 1: fetch -----------------------------------------------------------

def derive_category(types) -> str:
    types = set(types or [])
    if types & {"museum", "art_gallery", "historical_landmark",
                "hindu_temple", "buddhist_temple", "church", "mosque"}:
        return "cultural"
    if types & {"park", "zoo", "aquarium"}:
        return "nature"
    if types & {"amusement_park", "night_club", "shopping_mall", "stadium"}:
        return "urban"
    if "tourist_attraction" in types:
        return "attraction"
    return "other"


def derive_activities(types) -> str:
    types = set(types or [])
    out = []
    if "park" in types:           out.append("walking")
    if "zoo" in types:            out.append("wildlife")
    if "aquarium" in types:       out.append("wildlife")
    if "amusement_park" in types: out.append("rides")
    if "museum" in types:         out.append("sightseeing")
    if "shopping_mall" in types:  out.append("shopping")
    if "night_club" in types:     out.append("nightlife")
    if any(t.endswith("_temple") or t in ("church", "mosque") for t in types):
        out.append("sightseeing")
    return ";".join(sorted(set(out)))


def flatten(place: dict, source_category: str, source_cell: str,
            activity_type_override: str | None = None) -> dict:
    loc = place.get("location") or {}
    name = (place.get("displayName") or {}).get("text", "")
    primary_type_disp = (place.get("primaryTypeDisplayName") or {}).get("text", "")
    types = place.get("types") or []
    activity_type = activity_type_override or ""
    activities = activity_type_override or derive_activities(types)
    return {
        "google_place_id":   place.get("id", ""),
        "name":              name,
        "category":          activity_type_override or derive_category(types),
        "primary_type":      place.get("primaryType", ""),
        "primary_type_name": primary_type_disp,
        "activities":        activities,
        "activity_type":     activity_type,
        "lat":               loc.get("latitude", ""),
        "lon":               loc.get("longitude", ""),
        "address":           place.get("formattedAddress", ""),
        "rating":            place.get("rating", ""),
        "rating_count":      place.get("userRatingCount", ""),
        "price_level":       place.get("priceLevel", ""),
        "business_status":   place.get("businessStatus", ""),
        "website":           place.get("websiteUri", ""),
        "google_maps_url":   place.get("googleMapsUri", ""),
        "all_types":         ";".join(types),
        "found_via_category": source_category,
        "found_via_cell":     source_cell,
    }


def nearby_search(lat: float, lng: float, radius: int, included_type: str) -> list[dict]:
    body = {
        "includedTypes": [included_type],
        "maxResultCount": 20,
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": radius,
            }
        },
        "rankPreference": "POPULARITY",
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": NEARBY_FIELD_MASK,
    }
    try:
        r = requests.post(NEARBY_URL, json=body, headers=headers, timeout=30)
        if r.status_code == 429:
            print("    rate-limited, sleeping 5s", file=sys.stderr)
            time.sleep(5)
            r = requests.post(NEARBY_URL, json=body, headers=headers, timeout=30)
        r.raise_for_status()
        return r.json().get("places", [])
    except requests.RequestException as e:
        print(f"    error on {included_type} @ {lat},{lng}: {e}", file=sys.stderr)
        return []


def fetch_province(province: str, cells: list[tuple[str, float, float, int]],
                   categories: list[str],
                   activity_type_override: str | None = None) -> list[dict]:
    seen: dict[str, dict] = {}
    calls = 0
    dropped_foreign = 0
    for cell_label, lat, lng, radius in cells:
        print(f"  [{cell_label}] {lat},{lng} r={radius}m", file=sys.stderr)
        for cat in categories:
            results = nearby_search(lat, lng, radius, cat)
            calls += 1
            new = 0
            foreign = 0
            for p in results:
                pid = p.get("id")
                if not pid:
                    continue
                row = flatten(p, cat, cell_label, activity_type_override)
                if not is_in_cambodia(row.get("address"), row.get("lat"), row.get("lon")):
                    foreign += 1
                    continue
                if pid not in seen:
                    seen[pid] = row
                    new += 1
            dropped_foreign += foreign
            tag = f"({foreign} foreign)" if foreign else ""
            print(f"    {cat:24s} {len(results):>2} results, {new:>2} new {tag}".rstrip(), file=sys.stderr)
            time.sleep(0.05)
    print(f"  -> {calls} API calls, {len(seen)} unique places "
          f"({dropped_foreign} non-Cambodia dropped)", file=sys.stderr)
    return list(seen.values())


def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        print(f"  no rows to write to {path}", file=sys.stderr)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def read_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


# --- phase 2: rank ------------------------------------------------------------

def rank_top_n(rows: list[dict], n: int) -> list[dict]:
    # Defensive Cambodia filter — handles CSVs generated before is_in_cambodia
    # was added to the fetch phase.
    rows = [r for r in rows
            if is_in_cambodia(r.get("address"), r.get("lat"), r.get("lon"))]

    rated = [
        r for r in rows
        if to_float(r.get("rating"), 0.0) >= MIN_RATING
        and to_int(r.get("rating_count"), 0) >= MIN_REVIEWS
        and (r.get("business_status") or "OPERATIONAL") == "OPERATIONAL"
    ]
    if not rated:
        # Fall back to *any* operational place if the strict filter wipes it
        # out — common for sparse rural provinces.
        rated = [
            r for r in rows
            if to_float(r.get("rating"), 0.0) > 0
            and to_int(r.get("rating_count"), 0) > 0
            and (r.get("business_status") or "OPERATIONAL") == "OPERATIONAL"
        ]
    if not rated:
        return []

    global_mean = sum(to_float(r["rating"], 0.0) for r in rated) / len(rated)

    def score(r):
        R = to_float(r["rating"], 0.0)
        v = to_int(r["rating_count"], 0)
        return (v / (v + PRIOR_WEIGHT)) * R + (PRIOR_WEIGHT / (v + PRIOR_WEIGHT)) * global_mean

    rated.sort(key=score, reverse=True)
    return rated[:n]


# --- phase 3: photos ----------------------------------------------------------

def get_photo_names(place_id: str) -> list[str]:
    headers = {"X-Goog-Api-Key": API_KEY, "X-Goog-FieldMask": "photos"}
    try:
        r = requests.get(DETAILS_URL.format(place_id=place_id), headers=headers, timeout=30)
        if r.status_code == 429:
            time.sleep(5)
            r = requests.get(DETAILS_URL.format(place_id=place_id), headers=headers, timeout=30)
        r.raise_for_status()
        return [p["name"] for p in (r.json().get("photos") or []) if p.get("name")]
    except requests.RequestException as e:
        print(f"    details error for {place_id}: {e}", file=sys.stderr)
        return []


def download_photo(photo_name: str, dest_path: Path) -> bool:
    params = {"maxWidthPx": PHOTO_MAX_WIDTH_PX, "key": API_KEY}
    try:
        r = requests.get(PHOTO_URL.format(photo_name=photo_name),
                         params=params, timeout=60, stream=True)
        if r.status_code == 429:
            time.sleep(5)
            r = requests.get(PHOTO_URL.format(photo_name=photo_name),
                             params=params, timeout=60, stream=True)
        r.raise_for_status()
        with dest_path.open("wb") as f:
            for chunk in r.iter_content(chunk_size=64 * 1024):
                if chunk:
                    f.write(chunk)
        return True
    except requests.RequestException as e:
        print(f"    photo error: {e}", file=sys.stderr)
        return False


def download_photos_for(rows: list[dict], photo_root: Path, per_place: int) -> None:
    photo_root.mkdir(parents=True, exist_ok=True)
    for i, row in enumerate(rows, start=1):
        pid = (row.get("google_place_id") or "").strip()
        name = row.get("name", "")
        if not pid:
            continue
        place_dir = photo_root / pid
        place_dir.mkdir(parents=True, exist_ok=True)

        existing = sorted(p for p in place_dir.iterdir()
                          if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"))
        if len(existing) >= per_place:
            print(f"  [{i}/{len(rows)}] {name[:48]:<48} skip ({len(existing)} photos)", file=sys.stderr)
            continue

        photo_names = get_photo_names(pid)[:per_place]
        if not photo_names:
            print(f"  [{i}/{len(rows)}] {name[:48]:<48} no photos available", file=sys.stderr)
            continue

        got = 0
        for idx, pn in enumerate(photo_names, start=1):
            dest = place_dir / f"photo_{idx:02d}.jpg"
            if dest.exists():
                continue
            if download_photo(pn, dest):
                got += 1
            time.sleep(0.05)
        print(f"  [{i}/{len(rows)}] {name[:48]:<48} +{got} photos", file=sys.stderr)


# --- phase 4: seed DB + MinIO -------------------------------------------------

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


def find_attraction_by_place_id(cur, place_id: str):
    cur.execute('SELECT id FROM attraction WHERE google_place_id = %s LIMIT 1', (place_id,))
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


def update_existing_attraction(cur, attraction_id: str, row: dict) -> None:
    activity_type = (row.get("activity_type") or "").strip()
    if not activity_type:
        return
    cur.execute(
        """
        UPDATE attraction
        SET activity_type = %s,
            cached_rating = %s,
            cached_user_ratings_total = %s,
            places_refreshed_at = NOW(),
            updated_at = NOW()
        WHERE id = %s
        """,
        (
            activity_type,
            to_float(row.get("rating")),
            to_int(row.get("rating_count")),
            attraction_id,
        ),
    )


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


def seed_province(cur, minio_client: Minio, bucket: str,
                  rows: list[dict], photo_root: Path, province: str,
                  dry_run: bool) -> dict:
    inserted = reused = uploaded = skipped = 0
    for i, row in enumerate(rows, start=1):
        pid = (row.get("google_place_id") or "").strip()
        name = row.get("name", "")
        if not pid or not name:
            continue

        existing_id = find_attraction_by_place_id(cur, pid)
        if existing_id:
            aid = existing_id
            if not dry_run:
                update_existing_attraction(cur, aid, row)
            reused += 1
            tag = "reuse"
        else:
            if dry_run:
                aid = "<dry-run-uuid>"
            else:
                aid = insert_attraction(cur, row, province)
            inserted += 1
            tag = "insert"

        place_photo_dir = photo_root / pid
        if not place_photo_dir.exists():
            print(f"  [{i}/{len(rows)}] {tag} {name[:42]:<42} no photos dir")
            continue

        photos = sorted(p for p in place_photo_dir.iterdir()
                        if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"))
        if not photos:
            print(f"  [{i}/{len(rows)}] {tag} {name[:42]:<42} empty dir")
            continue

        already = set() if dry_run or aid == "<dry-run-uuid>" else existing_originals_for(cur, aid)
        this_uploaded = this_skipped = 0
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
            upload_mime = "image/jpeg"

            if not dry_run:
                minio_client.put_object(
                    bucket, filename, io.BytesIO(compressed),
                    length=len(compressed), content_type=upload_mime,
                )
                minio_client.put_object(
                    bucket, thumb_name, io.BytesIO(thumb),
                    length=len(thumb), content_type="image/jpeg",
                )
                insert_uploaded_file(
                    cur,
                    filename=filename, original=p.name,
                    mimetype=upload_mime, size=len(compressed),
                    has_thumbnail=True, attraction_id=aid,
                )
            this_uploaded += 1
            time.sleep(0.002)

        uploaded += this_uploaded
        skipped += this_skipped
        print(f"  [{i}/{len(rows)}] {tag} {name[:42]:<42} +{this_uploaded} (skip {this_skipped})")

    return {"inserted": inserted, "reused": reused,
            "uploaded": uploaded, "skipped": skipped}


# --- orchestrator -------------------------------------------------------------

def canonical_province_key(name: str) -> str:
    key = slugify(name)
    alias = PROVINCE_ALIASES.get(key)
    return slugify(alias) if alias else key


def select_provinces(args) -> list[tuple[str, list]]:
    if args.traveler_coffee_provinces:
        targets = {canonical_province_key(x) for x in TRAVELER_COFFEE_PROVINCES}
    elif args.province:
        targets = {canonical_province_key(args.province)}
    elif args.provinces:
        targets = {canonical_province_key(x) for x in args.provinces.split(",") if x.strip()}
    else:
        return PROVINCES
    chosen = [p for p in PROVINCES if canonical_province_key(p[0]) in targets]
    missing = targets - {canonical_province_key(p[0]) for p in chosen}
    if missing:
        sys.exit(f"Unknown province(s): {sorted(missing)}\n"
                 f"Valid: {[p[0] for p in PROVINCES]} "
                 f"(alias accepted: Sihanoukville)")
    return chosen


def db_connect(db_url: str):
    """Open a fresh DB connection with TCP keepalives so long-running
    pipelines don't get killed by an idle-connection timeout on the server."""
    conn = psycopg2.connect(
        db_url,
        connect_timeout=30,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
    )
    conn.autocommit = False
    return conn


def seed_one_province(db_url: str, minio_client: Minio, bucket: str,
                      rows: list[dict], photo_root: Path, province: str,
                      dry_run: bool) -> dict:
    """Open a fresh DB connection, seed one province in a single transaction,
    commit (or rollback on dry-run / error), close. Each province is its own
    atomic unit — a failure in one doesn't lose work from previous ones."""
    conn = db_connect(db_url)
    try:
        with conn.cursor() as cur:
            stats = seed_province(
                cur, minio_client, bucket,
                rows=rows, photo_root=photo_root, province=province,
                dry_run=dry_run,
            )
        if dry_run:
            conn.rollback()
        else:
            conn.commit()
        return stats
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            conn.close()
        except Exception:
            pass


def run(args) -> None:
    here = Path(__file__).resolve().parent
    csv_root   = here / "data"
    photo_root = here / "photos"
    csv_root.mkdir(exist_ok=True)
    photo_root.mkdir(exist_ok=True)

    targets = select_provinces(args)
    categories = COFFEE_PLACE_TYPES if args.coffee_only else CATEGORIES
    activity_type_override = "coffee" if args.coffee_only else None
    csv_suffix = "_coffee" if args.coffee_only else ""
    print(f"Provinces: {[p[0] for p in targets]}", file=sys.stderr)
    print(f"Place types: {categories}", file=sys.stderr)
    print(f"Mode: fetch={not args.skip_fetch} photos={not args.skip_photos} "
          f"seed={not args.skip_seed} dry_run={args.dry_run}", file=sys.stderr)

    # MinIO + DB only needed for the seed phase.
    minio_client = bucket = db_url = None
    if not args.skip_seed:
        load_env()
        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            sys.exit("ERROR: DATABASE_URL not set (needed for --seed)")
        minio_client = Minio(
            endpoint=os.environ["MINIO_ENDPOINT"],
            access_key=os.environ["MINIO_ACCESS_KEY"],
            secret_key=os.environ["MINIO_SECRET_KEY"],
            secure=os.environ.get("MINIO_USE_SSL", "false").lower() == "true",
        )
        bucket = os.environ["MINIO_BUCKET"]
        print(f"DB:    {db_url.split('@')[-1]}", file=sys.stderr)
        print(f"MinIO: {os.environ['MINIO_ENDPOINT']}/{bucket}", file=sys.stderr)

    totals = {"inserted": 0, "reused": 0, "uploaded": 0, "skipped": 0}
    failed: list[tuple[str, str]] = []

    for province, cells in targets:
        slug = slugify(province)
        print(f"\n=== {province} ===", file=sys.stderr)
        places_csv = csv_root / f"{slug}{csv_suffix}_places.csv"
        top_csv    = csv_root / f"{slug}{csv_suffix}_top{args.top}.csv"

        # 1. fetch
        if args.skip_fetch and places_csv.exists():
            rows = read_csv(places_csv)
            print(f"  [fetch] using existing {places_csv.name} ({len(rows)} rows)", file=sys.stderr)
        else:
            rows = fetch_province(
                province,
                cells,
                categories=categories,
                activity_type_override=activity_type_override,
            )
            write_csv(places_csv, rows)

        # 2. rank
        top = rank_top_n(rows, args.top)
        write_csv(top_csv, top)
        print(f"  [rank] {len(top)}/{len(rows)} -> {top_csv.name}", file=sys.stderr)
        if not top:
            print(f"  (no rows passed filter — skipping photos & seed)", file=sys.stderr)
            continue

        # 3. photos
        if args.skip_photos:
            print(f"  [photos] skipped", file=sys.stderr)
        else:
            download_photos_for(top, photo_root, args.photos_per_place)

        # 4. seed (own transaction per province; reconnects each time)
        if args.skip_seed:
            continue
        try:
            stats = seed_one_province(
                db_url, minio_client, bucket,
                rows=top, photo_root=photo_root, province=province,
                dry_run=args.dry_run,
            )
            for k, v in stats.items():
                totals[k] += v
            print(f"  [seed] {'rolled back' if args.dry_run else 'committed'}: {stats}", file=sys.stderr)
        except Exception as e:
            print(f"  [seed] FAILED for {province}: {e}", file=sys.stderr)
            failed.append((province, str(e)))
            continue  # keep going with the next province

    if not args.skip_seed:
        print(f"\nattractions inserted: {totals['inserted']}", file=sys.stderr)
        print(f"attractions reused:   {totals['reused']}", file=sys.stderr)
        print(f"photos uploaded:      {totals['uploaded']}", file=sys.stderr)
        print(f"photos skipped:       {totals['skipped']}", file=sys.stderr)
        if failed:
            print(f"\nfailed provinces ({len(failed)}):", file=sys.stderr)
            for name, err in failed:
                print(f"  - {name}: {err}", file=sys.stderr)
            sys.exit(1)


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Cambodia province attractions pipeline")
    ap.add_argument("--province", help="Single province name (e.g. 'Kampot')")
    ap.add_argument("--provinces", help="Comma-separated province names")
    ap.add_argument("--top", type=int, default=50, help="Top-N per province (default 50)")
    ap.add_argument("--photos-per-place", type=int, default=5, help="Photos per place (default 5)")
    ap.add_argument("--coffee-only", action="store_true",
                    help="Fetch only Google coffee place types and seed them as activity_type='coffee'")
    ap.add_argument("--traveler-coffee-provinces", action="store_true",
                    help="Use the traveler coffee province set: Kampot, Siem Reap, Phnom Penh, Sihanoukville/Preah Sihanouk, Kep, Battambang")
    ap.add_argument("--skip-fetch", action="store_true", help="Reuse existing _places.csv")
    ap.add_argument("--skip-photos", action="store_true", help="Don't download photos")
    ap.add_argument("--skip-seed", action="store_true", help="Don't write to DB / MinIO")
    ap.add_argument("--dry-run", action="store_true", help="Roll back DB writes")
    return ap.parse_args()


if __name__ == "__main__":
    run(parse_args())
