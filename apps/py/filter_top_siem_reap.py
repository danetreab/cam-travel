"""
Filter siem_reap_places.csv to the top 50 highest-rated, popular places.

Strategy:
  - Drop rows without a rating or with a rating below 4.0.
  - Drop rows with very few reviews (likely noisy).
  - Rank using a Bayesian-style score that balances rating quality
    against review volume, so a 4.9 with 30 reviews doesn't outrank
    a 4.5 with 10,000 reviews.
"""

import csv
import sys

IN_PATH = "siem_reap_places.csv"
OUT_PATH = "siem_reap_top50.csv"

MIN_RATING = 4.0
MIN_REVIEWS = 100
TOP_N = 50

# Bayesian average: (v / (v + m)) * R + (m / (v + m)) * C
#   R = place rating, v = review count, C = global mean rating, m = prior weight
PRIOR_WEIGHT = 500  # bigger -> more trust in popular places


def to_float(x, default=0.0):
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def to_int(x, default=0):
    try:
        return int(float(x))
    except (TypeError, ValueError):
        return default


def main(in_path, out_path):
    with open(in_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    rated = [
        r for r in rows
        if to_float(r.get("rating")) >= MIN_RATING
        and to_int(r.get("rating_count")) >= MIN_REVIEWS
        and (r.get("business_status") or "OPERATIONAL") == "OPERATIONAL"
    ]

    if not rated:
        print("No rows matched the filter.", file=sys.stderr)
        sys.exit(1)

    global_mean = sum(to_float(r["rating"]) for r in rated) / len(rated)

    def score(r):
        R = to_float(r["rating"])
        v = to_int(r["rating_count"])
        return (v / (v + PRIOR_WEIGHT)) * R + (PRIOR_WEIGHT / (v + PRIOR_WEIGHT)) * global_mean

    rated.sort(key=score, reverse=True)
    top = rated[:TOP_N]

    fieldnames = list(rows[0].keys())
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(top)

    print(
        f"Input: {len(rows)}  passed filter: {len(rated)}  "
        f"wrote top {len(top)} -> {out_path}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main(
        sys.argv[1] if len(sys.argv) > 1 else IN_PATH,
        sys.argv[2] if len(sys.argv) > 2 else OUT_PATH,
    )
