export type TripIntent =
  | "RECOMMEND_PLACES"
  | "CREATE_ITINERARY"
  | "FIND_NEARBY"
  | "OPTIMIZE_ROUTE"
  | "FOOD_RECOMMENDATION"
  | "BUDGET_PLAN"
  | "REPLACE_PLACE"
  | "TIME_BASED_RECOMMENDATION"
  | "FILTERED_RECOMMENDATION"

export type FollowUpAction =
  | "CREATE_ITINERARY"
  | "SHOW_MAP"
  | "FILTER_BY_BUDGET"
  | "FIND_NEARBY_FOOD"
  | "OPTIMIZE_ROUTE"
  | "SAVE_PLACES"

export interface AiTravelPlace {
  googlePlaceId: string
  attractionId: string | null
  name: string
  address: string | null
  latitude: number
  longitude: number
  rating: number | null
  userRatingCount: number | null
  googleMapsUri: string | null
  types: string[]
  category: string | null
  reason: string | null
  photoName: string | null
  photoUrl: string | null
  order: number | null
  saved: boolean
  removed: boolean
}

export interface AiTravelGroup {
  category: string
  places: AiTravelPlace[]
}

export interface AiTravelItineraryDay {
  day: number
  title: string
  places: Array<{
    googlePlaceId: string
    name: string
    order: number
    startTime: string | null
    notes: string | null
  }>
}

export interface AiTravelResponse {
  planId: string
  intent: TripIntent
  destination: string | null
  title: string
  groups: AiTravelGroup[]
  places: AiTravelPlace[]
  itinerary: { days: AiTravelItineraryDay[] } | null
  map: {
    center: { lat: number; lng: number } | null
    zoom: number
    pins: Array<{
      googlePlaceId: string
      name: string
      lat: number
      lng: number
      order: number | null
      category: string | null
      saved: boolean
      removed: boolean
    }>
  }
  followUpActions: FollowUpAction[]
}

export interface AiTravelRequest {
  message: string
  planId?: string
  userLocation?: { lat: number; lng: number } | null
  language?: string
}
