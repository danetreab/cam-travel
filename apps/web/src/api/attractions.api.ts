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

// The first identifier after `query`/`mutation`/`subscription`. The gateway's
// AuthGuard consults this name to decide whether a request is in the guest
// allowlist, so it must be sent on every call — not just when the server is
// running multiple operations.
const OPERATION_NAME_RE = /\b(?:query|mutation|subscription)\s+(\w+)/

function extractOperationName(query: string): string | undefined {
  return query.match(OPERATION_NAME_RE)?.[1]
}

async function gql<TData>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<TData> {
  const operationName = extractOperationName(query)
  const res = await fetch(envClient.VITE_GRAPHQL_HTTP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables, operationName }),
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

const MY_SAVED_ATTRACTIONS = `
  query MySavedAttractions {
    mySavedAttractions {
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

const MY_SAVED_ATTRACTION_IDS = `
  query MySavedAttractionIds {
    mySavedAttractionIds
  }
`

const SAVE_ATTRACTION = `
  mutation SaveAttraction($attractionId: ID!) {
    saveAttraction(attractionId: $attractionId) {
      id
    }
  }
`

const UNSAVE_ATTRACTION = `
  mutation UnsaveAttraction($attractionId: ID!) {
    unsaveAttraction(attractionId: $attractionId)
  }
`

export async function listMySavedAttractions(): Promise<AttractionListResult> {
  const data = await gql<{ mySavedAttractions: Attraction[] }>(
    MY_SAVED_ATTRACTIONS,
  )
  return {
    items: data.mySavedAttractions,
    totalCount: data.mySavedAttractions.length,
  }
}

export async function listMySavedAttractionIds(): Promise<string[]> {
  const data = await gql<{ mySavedAttractionIds: string[] }>(
    MY_SAVED_ATTRACTION_IDS,
  )
  return data.mySavedAttractionIds
}

export async function saveAttraction(attractionId: string): Promise<string> {
  const data = await gql<{ saveAttraction: { id: string } }>(SAVE_ATTRACTION, {
    attractionId,
  })
  return data.saveAttraction.id
}

export async function unsaveAttraction(attractionId: string): Promise<string> {
  const data = await gql<{ unsaveAttraction: string }>(UNSAVE_ATTRACTION, {
    attractionId,
  })
  return data.unsaveAttraction
}

const ATTRACTION_BY_ID = `
  query AttractionById($id: ID!) {
    attractions(filter: { id: { eq: $id } }, paging: { limit: 1 }) {
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
    }
  }
`

export async function getAttractionById(id: string): Promise<Attraction | null> {
  const data = await gql<{ attractions: { nodes: Attraction[] } }>(
    ATTRACTION_BY_ID,
    { id },
  )
  return data.attractions.nodes[0] ?? null
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
