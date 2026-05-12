"""
Crawl tourism / adventure places in Siem Reap from Google Places API (v1)
and save them as a CSV ready for review.

Usage:
    export GOOGLE_PLACES_API_KEY=AIza...
    python3 fetch_siem_reap_places.py siem_reap_places.csv

Cost estimate (Google Places API v1, May 2026 - VERIFY current pricing):
    ~15 grid cells x ~15 categories = ~225 Nearby Search calls
    At roughly $32 / 1000 calls = ~$7 for one full crawl.
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
import os
import sys
import time
import requests

API_KEY = "AIzaSyBfINhAQsM-LooaTt7pE9FWbSQz4AOK0eQ"
if not API_KEY:
    sys.exit("ERROR: set GOOGLE_PLACES_API_KEY environment variable")

NEARBY_URL  = "https://places.googleapis.com/v1/places:searchNearby"
DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"

# Siem Reap coverage. Each cell is a circle; radius in meters.
# Town centre + the Angkor Archaeological Park + outlying temple groups
# (Banteay Srei, Roluos, Beng Mealea, Phnom Kulen) + Tonle Sap villages.
GRID_CELLS = [
    # (label, lat, lng, radius_m)
    ("Town centre / Pub Street",     13.3550, 103.8550, 2500),
    ("Wat Bo / Riverside east",      13.3580, 103.8650, 2000),
    ("Sok San Rd / hotel west",      13.3550, 103.8400, 2500),
    ("Charles de Gaulle (N corridor)", 13.3800, 103.8580, 2500),
    ("Angkor Wat",                   13.4125, 103.8670, 2000),
    ("Angkor Thom (Bayon area)",     13.4413, 103.8587, 3000),
    ("Small circuit (Ta Prohm/Keo)", 13.4350, 103.8900, 3000),
    ("Grand circuit (Preah Khan)",   13.4650, 103.8780, 3000),
    ("Banteay Srei (NE)",            13.5985, 103.9628, 5000),
    ("Roluos group (E)",             13.3370, 103.9716, 3000),
    ("Tonle Sap / Chong Khneas",     13.2700, 103.8350, 5000),
    ("Kompong Phluk stilt village",  13.2470, 103.9650, 5000),
    ("Phnom Kulen (NE mountain)",    13.5773, 104.1183, 5000),
    ("Beng Mealea (far E)",          13.4756, 104.2375, 5000),
    ("SR Intl Airport area",         13.4072, 103.8133, 2500),
]

# Categories to query. Each is one Nearby Search call per cell.
# Siem Reap skews heavy on temples/ruins; nightlife and shopping concentrate
# around Pub Street/Old Market in the town-centre cell.
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
    out = sys.argv[1] if len(sys.argv) > 1 else "siem_reap_places.csv"
    enrich = "--enrich" in sys.argv
    main(out, enrich=enrich)
