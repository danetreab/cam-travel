import { describe, expect, it } from "vitest"

import { getGoogleMapsPlaceUrl } from "./google-maps"
import type { Attraction } from "@/types/attraction"

const attraction: Attraction = {
  id: "attraction-1",
  name: "Angkor Wat",
  description: null,
  latitude: 13.4125,
  longitude: 103.867,
  province: "Siem Reap",
  activityType: "cultural",
  googlePlaceId: "ChIJLfySpTO3EDERsJydxYFzQFw",
  cachedRating: 4.8,
  cachedUserRatingsTotal: 100,
  files: [],
}

describe("getGoogleMapsPlaceUrl", () => {
  it("links to the specific Google place when a place ID is available", () => {
    const url = new URL(getGoogleMapsPlaceUrl(attraction))

    expect(url.searchParams.get("api")).toBe("1")
    expect(url.searchParams.get("query")).toBe(
      "Angkor Wat, Siem Reap, Cambodia"
    )
    expect(url.searchParams.get("query_place_id")).toBe(
      attraction.googlePlaceId
    )
  })

  it("falls back to a named place search instead of a coordinate pin", () => {
    const url = new URL(
      getGoogleMapsPlaceUrl({ ...attraction, googlePlaceId: null })
    )

    expect(url.searchParams.get("query")).toBe(
      "Angkor Wat, Siem Reap, Cambodia"
    )
    expect(url.searchParams.has("query_place_id")).toBe(false)
  })
})
