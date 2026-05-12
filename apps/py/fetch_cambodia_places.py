"""
Fetch tourism / adventure POIs in Cambodia from OpenStreetMap (Overpass API)
and save them as a clean CSV ready for review in Excel/Sheets.

Output columns are chosen to map cleanly onto a future Postgres schema.
"""

import csv
import json
import sys
import time
import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
HEADERS = {
    "User-Agent": "cam-travel/0.1 (contact: danetreab@gmail.com)",
    "Accept": "application/json",
}

QUERY = """
[out:json][timeout:300];
area["ISO3166-1"="KH"][admin_level=2]->.kh;
(
  // Tourism
  node["tourism"~"attraction|viewpoint|museum|gallery|zoo|theme_park|artwork"](area.kh);
  way["tourism"~"attraction|viewpoint|museum|gallery|zoo|theme_park"](area.kh);

  // Historic & cultural
  node["historic"](area.kh);
  way["historic"](area.kh);

  // Natural features (adventure-relevant)
  node["natural"~"waterfall|peak|cave_entrance|beach|hot_spring"](area.kh);
  way["natural"~"waterfall|beach"](area.kh);

  // Religious sites (Angkor-style temples are often tagged here)
  node["amenity"="place_of_worship"](area.kh);
  way["amenity"="place_of_worship"](area.kh);

  // Protected/national parks
  way["boundary"="protected_area"](area.kh);
  way["leisure"="nature_reserve"](area.kh);
  relation["boundary"="protected_area"](area.kh);

  // Adventure-specific
  node["sport"~"climbing|diving|kayak|rafting"](area.kh);
  node["route"~"hiking|bicycle"](area.kh);
);
out center tags;
"""

# Map an OSM element to a single primary category we care about.
def derive_category(tags):
    if tags.get("tourism") in ("museum", "gallery", "artwork"):
        return "cultural"
    if tags.get("historic"):
        return "cultural"
    if tags.get("amenity") == "place_of_worship":
        return "cultural"
    if tags.get("natural") == "beach" or tags.get("tourism") == "beach":
        return "beach"
    if tags.get("natural") in ("waterfall", "cave_entrance", "peak", "hot_spring"):
        return "nature"
    if tags.get("boundary") == "protected_area" or tags.get("leisure") == "nature_reserve":
        return "nature"
    if tags.get("sport") or tags.get("route"):
        return "adventure"
    if tags.get("tourism") in ("zoo", "theme_park"):
        return "urban"
    if tags.get("tourism") in ("attraction", "viewpoint"):
        return "attraction"
    return "other"


def derive_activities(tags):
    activities = []
    sport = tags.get("sport", "")
    route = tags.get("route", "")
    natural = tags.get("natural", "")
    leisure = tags.get("leisure", "")

    if "climbing" in sport: activities.append("climbing")
    if "diving" in sport:   activities.append("diving")
    if "kayak" in sport:    activities.append("kayaking")
    if "rafting" in sport:  activities.append("rafting")
    if "hiking" in route:   activities.append("hiking")
    if "bicycle" in route:  activities.append("cycling")
    if natural == "waterfall":     activities.append("swimming")
    if natural == "beach":         activities.append("swimming")
    if natural == "cave_entrance": activities.append("caving")
    if natural == "peak":          activities.append("hiking")
    if leisure == "nature_reserve": activities.append("wildlife")
    return ";".join(sorted(set(activities)))


def get_coords(element):
    """Nodes have lat/lon directly; ways/relations use 'center' from `out center`."""
    if element["type"] == "node":
        return element.get("lat"), element.get("lon")
    center = element.get("center") or {}
    return center.get("lat"), center.get("lon")


def main(out_path):
    print("Fetching from Overpass... (this can take 30-90 seconds)", file=sys.stderr)
    t0 = time.time()
    resp = requests.post(OVERPASS_URL, data={"data": QUERY}, headers=HEADERS, timeout=400)
    resp.raise_for_status()
    data = resp.json()
    elements = data.get("elements", [])
    print(f"Got {len(elements)} elements in {time.time()-t0:.1f}s", file=sys.stderr)

    rows = []
    for el in elements:
        tags = el.get("tags", {}) or {}
        # Skip unnamed POIs - they're rarely useful for a travel app
        name = tags.get("name") or tags.get("name:en")
        if not name:
            continue

        lat, lon = get_coords(el)
        if lat is None or lon is None:
            continue

        rows.append({
            "osm_type":     el["type"],                          # node / way / relation
            "osm_id":       el["id"],
            "name":         name,
            "name_en":      tags.get("name:en", ""),
            "name_km":      tags.get("name:km", ""),
            "category":     derive_category(tags),
            "subtype":      tags.get("tourism") or tags.get("historic") or
                            tags.get("natural") or tags.get("leisure") or
                            tags.get("amenity") or tags.get("sport") or
                            tags.get("route") or tags.get("boundary") or "",
            "activities":   derive_activities(tags),
            "lat":          lat,
            "lon":          lon,
            "province":     tags.get("addr:province", "") or tags.get("is_in:province", ""),
            "city":         tags.get("addr:city", ""),
            "address":      tags.get("addr:full", "") or tags.get("addr:street", ""),
            "website":      tags.get("website", "") or tags.get("contact:website", ""),
            "phone":        tags.get("phone", "") or tags.get("contact:phone", ""),
            "wikipedia":    tags.get("wikipedia", ""),
            "wikidata":     tags.get("wikidata", ""),
            "description":  tags.get("description", ""),
            "opening_hours": tags.get("opening_hours", ""),
            "fee":          tags.get("fee", ""),
            "all_tags_json": json.dumps(tags, ensure_ascii=False),
        })

    # Dedupe by (name, rounded coords) - OSM sometimes has node + way for same place
    seen = set()
    deduped = []
    for r in rows:
        key = (r["name"].strip().lower(), round(r["lat"], 4), round(r["lon"], 4))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)

    print(f"After filtering/dedup: {len(deduped)} places", file=sys.stderr)

    fieldnames = list(deduped[0].keys()) if deduped else []
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(deduped)

    print(f"Wrote {out_path}", file=sys.stderr)
    return deduped


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "cambodia_places.csv"
    main(out)
