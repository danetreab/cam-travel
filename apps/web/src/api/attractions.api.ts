import { envClient } from "@/env"
import type { Attraction, AttractionListResult } from "@/types/attraction"

// REST-shaped wrapper around the GraphQL HTTP endpoint. Callers get plain
// async functions; the transport detail stays here. If a true REST surface
// is added later, only this file changes.
//
// 10s ceiling on every call. Loader fetches that run during SSR cannot be
// allowed to outlive the upstream proxy read timeout — if they do, the
// connection closes mid-render and React surfaces it as an AbortError that
// h3 turns into a 502 Bad Gateway.
const GQL_TIMEOUT_MS = 10000

async function gql<TData>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<TData> {
  const res = await fetch(envClient.VITE_GRAPHQL_HTTP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    credentials: "include",
    signal: AbortSignal.timeout(GQL_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`Network error ${res.status} fetching ${envClient.VITE_GRAPHQL_HTTP_URL}`)
  }
  const json = (await res.json()) as {
    data?: TData
    errors?: Array<{ message: string }>
  }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "))
  }
  if (!json.data) {
    throw new Error("Empty response from server")
  }
  return json.data
}

const ATTRACTIONS_LIST = `
  query AttractionsList(
    $filter: AttractionFilter
    $paging: OffsetPaging
    $sorting: [AttractionSort!]
  ) {
    attractions(filter: $filter, paging: $paging, sorting: $sorting) {
      nodes {
        id
        name
        description
        latitude
        longitude
        province
        activityType
        cachedRating
        cachedUserRatingsTotal
        files {
          id
          url
          thumbnailUrl
          hasThumbnail
          mimetype
        }
      }
      totalCount
    }
  }
`

export interface MapBounds {
  south: number
  west: number
  north: number
  east: number
}

export interface ListAttractionsParams {
  province?: string
  activityType?: string
  limit?: number
  bounds?: MapBounds
}

const ATTRACTIONS_TOP_PER_PROVINCE = `
  query AttractionsTopPerProvince($input: AttractionsTopPerProvinceInput!) {
    attractionsTopPerProvince(input: $input) {
      id
      name
      description
      latitude
      longitude
      province
      activityType
      cachedRating
      cachedUserRatingsTotal
      files {
        id
        url
        thumbnailUrl
        hasThumbnail
        mimetype
      }
    }
  }
`

export interface ListTopPerProvinceParams {
  perProvince?: number
  bounds?: MapBounds
  activityType?: string
}

export async function listTopPerProvince(
  params: ListTopPerProvinceParams = {},
): Promise<AttractionListResult> {
  const input: Record<string, unknown> = {
    perProvince: params.perProvince ?? 20,
  }
  if (params.bounds) input.bounds = params.bounds
  if (params.activityType) input.activityType = params.activityType

  const data = await gql<{ attractionsTopPerProvince: Attraction[] }>(
    ATTRACTIONS_TOP_PER_PROVINCE,
    { input },
  )
  return {
    items: data.attractionsTopPerProvince,
    totalCount: data.attractionsTopPerProvince.length,
  }
}

export async function listAttractions(
  params: ListAttractionsParams = {},
): Promise<AttractionListResult> {
  const and: Array<Record<string, unknown>> = []
  if (params.province) {
    and.push({ province: { eq: params.province } })
  }
  if (params.activityType) {
    and.push({ activityType: { eq: params.activityType } })
  }
  if (params.bounds) {
    const { south, west, north, east } = params.bounds
    and.push({ latitude: { gte: south, lte: north } })
    and.push({ longitude: { gte: west, lte: east } })
  }
  const filter = and.length === 0 ? undefined : and.length === 1 ? and[0] : { and }
  const paging = { limit: params.limit ?? 200 }
  // Bias toward Google-popular places so that when the limit truncates the
  // result set (e.g. zoomed out), the survivors are the ones a visitor most
  // likely wants to see — mirrors Airbnb's "show the top N for this viewport".
  const sorting = [
    { field: "cachedUserRatingsTotal", direction: "DESC", nulls: "NULLS_LAST" },
  ]

  const data = await gql<{
    attractions: { nodes: Attraction[]; totalCount: number }
  }>(ATTRACTIONS_LIST, { filter, paging, sorting })

  return {
    items: data.attractions.nodes,
    totalCount: data.attractions.totalCount,
  }
}
