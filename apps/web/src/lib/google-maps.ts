import type { Attraction } from "@/types/attraction"

export function getGoogleMapsPlaceUrl(attraction: Attraction): string {
  const query = [attraction.name, attraction.province, "Cambodia"]
    .filter(Boolean)
    .join(", ")
  const params = new URLSearchParams({ api: "1", query })
  const placeId = attraction.googlePlaceId?.trim()

  if (placeId) {
    params.set("query_place_id", placeId)
  }

  return `https://www.google.com/maps/search/?${params.toString()}`
}
