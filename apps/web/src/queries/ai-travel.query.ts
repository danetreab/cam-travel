import { queryOptions } from "@tanstack/react-query"
import { getAiTravelPlan } from "@/api/ai-travel.api"

export const aiTravelPlanQueryOptions = (planId: string) =>
  queryOptions({
    queryKey: ["ai-travel-plan", planId],
    queryFn: () => getAiTravelPlan(planId),
    enabled: planId.length > 0,
    staleTime: 30_000,
  })
