import { describe, expect, it } from "vitest"

import { buildGoogleMapsRouteUrl } from "./google-maps-route"

const stops = [
  {
    googlePlaceId: "place-one",
    latitude: 11.55,
    longitude: 104.91,
  },
  {
    googlePlaceId: "place-two",
    latitude: 11.56,
    longitude: 104.92,
  },
  {
    googlePlaceId: "place-three",
    latitude: 11.57,
    longitude: 104.93,
  },
]

function routeParams(url: string | null) {
  expect(url).not.toBeNull()
  return new URL(url!).searchParams
}

describe("buildGoogleMapsRouteUrl", () => {
  it("starts at the provided user location and keeps every plan stop", () => {
    const params = routeParams(
      buildGoogleMapsRouteUrl(stops, { lat: 11.54, lng: 104.9 })
    )

    expect(params.get("origin")).toBe("11.54,104.9")
    expect(params.get("waypoints")).toBe("11.55,104.91|11.56,104.92")
    expect(params.get("waypoint_place_ids")).toBe("place-one|place-two")
    expect(params.get("destination")).toBe("11.57,104.93")
    expect(params.get("destination_place_id")).toBe("place-three")
    expect(params.get("dir_action")).toBe("navigate")
  })

  it("lets Google Maps use the device location when origin is unavailable", () => {
    const params = routeParams(buildGoogleMapsRouteUrl(stops, null))

    expect(params.has("origin")).toBe(false)
    expect(params.get("waypoint_place_ids")).toBe("place-one|place-two")
  })

  it("supports navigation to a single plan stop", () => {
    const params = routeParams(buildGoogleMapsRouteUrl([stops[0]], null))

    expect(params.get("destination_place_id")).toBe("place-one")
    expect(params.has("waypoints")).toBe(false)
  })

  it("does not create a route without a destination", () => {
    expect(buildGoogleMapsRouteUrl([], null)).toBeNull()
  })
})
