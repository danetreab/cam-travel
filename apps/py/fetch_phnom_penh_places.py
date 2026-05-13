"""
Crawl tourism / adventure places in Phnom Penh from Google Places API (v1)
and save them as a CSV ready for review.

Usage:
    export GOOGLE_PLACES_API_KEY=AIza...
    python3 fetch_phnom_penh_places.py phnom_penh_places.csv

Cost estimate (Google Places API v1, May 2026 — VERIFY current pricing):
    ~14 grid cells x ~10 categories x up to 3 pages = ~420 Nearby Search calls
    At roughly $32 / 1000 calls = ~$13 for one full crawl.
    Place Details (optional --enrich) adds ~$17 / 1000 hydrated places.

Notes on Google ToS:
    - You may store `place_id` indefinitely.
    - Other fields (name, address, photos, etc.) should be treated as a
      short-term cache. Refresh periodically; do not redistribute as a
      standalone dataset.
    - This script writes everything to CSV for YOUR review/curation. When
      you load into your production DB, store only place_id long-term and
      re-fetch other fields live or on a refresh schedule.
"""

import csv
import json
import os
import sys
import time
import requests

API_KEY = "AIzaSyAA7KX1zegLnNZDvsLPez59_3SlzdyhJqI"
if not API_KEY:
    sys.exit("ERROR: set GOOGLE_PLACES_API_KEY environment variable")

NEARBY_URL  = "https://places.googleapis.com/v1/places:searchNearby"
DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"

# Phnom Penh coverage. Each cell is a circle; radius in meters.
# Centers chosen to overlap and cover the main districts.
GRID_CELLS = [
    # (label, lat, lng, radius_m)
    ("Daun Penh / Riverside",   11.5680, 104.9300, 2500),
    ("Chamkarmon / BKK",        11.5450, 104.9220, 2500),
    ("Toul Kork",               11.5750, 104.8950, 2500),
    ("7 Makara / Olympic",      11.5550, 104.9080, 2000),
    ("Mean Chey",               11.5180, 104.9100, 3000),
    ("Russey Keo",              11.6050, 104.9100, 3000),
    ("Sen Sok",                 11.5950, 104.8700, 3000),
    ("Pou Senchey",             11.5400, 104.8500, 3500),
    ("Chbar Ampov / east bank", 11.5400, 104.9550, 3000),
    ("Chroy Changvar",          11.5950, 104.9450, 2500),
    ("Diamond Island / south",  11.5400, 104.9350, 1500),
    ("Stueng Mean Chey",        11.5250, 104.8850, 3000),
    ("Boeung Keng Kang",        11.5500, 104.9270, 1500),
    ("Phnom Penh airport",      11.5500, 104.8470, 2500),
]

# Categories to query. Each is one Nearby Search call per cell.
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
    "night_club",          # Phnom Penh nightlife
    "shopping_mall",
]

# Field mask for the cheap Nearby Search call - only what we need.
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

# Field mask for optional enrichment via Place Details.
DETAILS_FIELD_MASK = ",".join([
    "id",
    "displayName",
    "formattedAddress",
    "addressComponents",
    "location",
    "types",
    "primaryType",
    "rating",
    "userRatingCount",
    "regularOpeningHours",
    "websiteUri",
    "internationalPhoneNumber",
    "googleMapsUri",
    "editorialSummary",
    "photos",
])


def nearby_search(lat, lng, radius, included_type):
    """Call Nearby Search for one cell + category. Returns list of place dicts."""
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
            print("  rate-limited, sleeping 5s", file=sys.stderr)
            time.sleep(5)
            r = requests.post(NEARBY_URL, json=body, headers=headers, timeout=30)
        r.raise_for_status()
        return r.json().get("places", [])
    except requests.RequestException as e:
        print(f"  error on {included_type} @ {lat},{lng}: {e}", file=sys.stderr)
        return []


def place_details(place_id):
    """Optional second call to get richer fields per place."""
    headers = {
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
    }
    try:
        r = requests.get(DETAILS_URL.format(place_id=place_id),
                         headers=headers, timeout=30)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        print(f"  details error for {place_id}: {e}", file=sys.stderr)
        return {}


def derive_category(types):
    """Map Google's many type tags to our app's primary category."""
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


def derive_activities(types):
    """Crude activity hints from types."""
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


def flatten(place, source_category, source_cell):
    """Turn a Google place dict into a flat CSV row."""
    loc = place.get("location") or {}
    name = (place.get("displayName") or {}).get("text", "")
    primary_type_disp = (place.get("primaryTypeDisplayName") or {}).get("text", "")
    types = place.get("types") or []

    return {
        "google_place_id":   place.get("id", ""),
        "name":              name,
        "category":          derive_category(types),
        "primary_type":      place.get("primaryType", ""),
        "primary_type_name": primary_type_disp,
        "activities":        derive_activities(types),
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


def main(out_path, enrich=False):
    seen = {}  # place_id -> row
    total_calls = 0

    for cell_label, lat, lng, radius in GRID_CELLS:
        print(f"\n[{cell_label}] {lat},{lng} r={radius}m", file=sys.stderr)
        for cat in CATEGORIES:
            results = nearby_search(lat, lng, radius, cat)
            total_calls += 1
            new_in_call = 0
            for p in results:
                pid = p.get("id")
                if not pid:
                    continue
                if pid not in seen:
                    seen[pid] = flatten(p, cat, cell_label)
                    new_in_call += 1
            print(f"  {cat:24s} {len(results):>2} results, {new_in_call:>2} new", file=sys.stderr)
            time.sleep(0.05)  # gentle pacing

    print(f"\nTotal API calls: {total_calls}", file=sys.stderr)
    print(f"Unique places:   {len(seen)}", file=sys.stderr)

    rows = list(seen.values())

    # Optional enrichment pass (extra cost - skip unless needed)
    if enrich:
        print(f"\nEnriching {len(rows)} places via Place Details...", file=sys.stderr)
        for i, row in enumerate(rows):
            d = place_details(row["google_place_id"])
            if d:
                hours = d.get("regularOpeningHours") or {}
                weekday = hours.get("weekdayDescriptions") or []
                row["opening_hours"] = " | ".join(weekday)
                row["phone"] = d.get("internationalPhoneNumber", "")
                summary = (d.get("editorialSummary") or {}).get("text", "")
                row["editorial_summary"] = summary
            if (i + 1) % 25 == 0:
                print(f"  enriched {i+1}/{len(rows)}", file=sys.stderr)
            time.sleep(0.05)

    fieldnames = list(rows[0].keys()) if rows else []
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    print(f"\nWrote {out_path}", file=sys.stderr)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "phnom_penh_places.csv"
    enrich = "--enrich" in sys.argv
    main(out, enrich=enrich)
