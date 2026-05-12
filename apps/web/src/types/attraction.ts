export interface AttractionFile {
  id: string
  url: string
  thumbnailUrl: string | null
  mimetype: string
  hasThumbnail: boolean
}

export interface Attraction {
  id: string
  name: string
  description: string | null
  latitude: number
  longitude: number
  province: string | null
  activityType: string | null
  cachedRating: number | null
  cachedUserRatingsTotal: number | null
  files: AttractionFile[]
}

export interface AttractionListResult {
  items: Attraction[]
  totalCount: number
}
