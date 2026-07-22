export type GoogleMapsRouteOrigin = {
  lat: number
  lng: number
}

export type GoogleMapsRouteStop = {
  googlePlaceId: string
  latitude: number
  longitude: number
}

function routePoint(point: { latitude: number; longitude: number }) {
  return `${point.latitude},${point.longitude}`
}

export function buildGoogleMapsRouteUrl(
  stops: Array<GoogleMapsRouteStop>,
  origin: GoogleMapsRouteOrigin | null
): string | null {
  const destination = stops.at(-1)
  if (!destination) return null

  const waypoints = stops.slice(0, -1)
  const params = new URLSearchParams({
    api: "1",
    destination: routePoint(destination),
    destination_place_id: destination.googlePlaceId,
    travelmode: "driving",
    dir_action: "navigate",
  })

  if (origin) {
    params.set("origin", `${origin.lat},${origin.lng}`)
  }

  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.map(routePoint).join("|"))
    params.set(
      "waypoint_place_ids",
      waypoints.map((place) => place.googlePlaceId).join("|")
    )
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`
}
