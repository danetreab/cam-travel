import { queryOptions } from "@tanstack/react-query"
import {
  getAttractionById,
  listAttractions,
  listTopPerProvince,
  type ListAttractionsParams,
  type ListTopPerProvinceParams,
} from "@/api/attractions.api"

export const attractionsListQueryOptions = (
  params: ListAttractionsParams = {},
) =>
  queryOptions({
    queryKey: ["attractions", "list", params],
    queryFn: () => listAttractions(params),
    staleTime: 60_000,
  })

export const attractionsTopPerProvinceQueryOptions = (
  params: ListTopPerProvinceParams = {},
) =>
  queryOptions({
    queryKey: ["attractions", "top-per-province", params],
    queryFn: () => listTopPerProvince(params),
    staleTime: 60_000,
  })

export const attractionByIdQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["attractions", "by-id", id],
    queryFn: () => getAttractionById(id),
    staleTime: 60_000,
  })
