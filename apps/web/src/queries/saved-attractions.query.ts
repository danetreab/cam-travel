import { queryOptions } from "@tanstack/react-query"
import {
  listMySavedAttractionIds,
  listMySavedAttractions,
} from "@/api/attractions.api"

export const savedAttractionsListQueryOptions = () =>
  queryOptions({
    queryKey: ["saved-attractions", "list"],
    queryFn: () => listMySavedAttractions(),
    staleTime: 30_000,
  })

export const savedAttractionIdsQueryOptions = () =>
  queryOptions({
    queryKey: ["saved-attractions", "ids"],
    queryFn: () => listMySavedAttractionIds(),
    staleTime: 30_000,
  })
