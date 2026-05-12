import { queryOptions } from "@tanstack/react-query"
import {
  listAttractions,
  type ListAttractionsParams,
} from "@/api/attractions.api"

export const attractionsListQueryOptions = (
  params: ListAttractionsParams = {},
) =>
  queryOptions({
    queryKey: ["attractions", "list", params],
    queryFn: () => listAttractions(params),
    staleTime: 60_000,
  })
