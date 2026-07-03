import { queryOptions } from "@tanstack/react-query"
import {
  getAiTravelPlan,
  getAiTravelSession,
  listAiTravelSessions,
} from "@/api/ai-travel.api"

export const aiTravelPlanQueryOptions = (planId: string) =>
  queryOptions({
    queryKey: ["ai-travel-plan", planId],
    queryFn: () => getAiTravelPlan(planId),
    enabled: planId.length > 0,
    staleTime: 30_000,
  })

export const aiTravelSessionsQueryOptions = () =>
  queryOptions({
    queryKey: ["ai-travel-sessions"],
    queryFn: listAiTravelSessions,
    staleTime: 30_000,
  })

export const aiTravelSessionQueryOptions = (sessionId: string) =>
  queryOptions({
    queryKey: ["ai-travel-session", sessionId],
    queryFn: () => getAiTravelSession(sessionId),
    enabled: sessionId.length > 0,
    staleTime: 30_000,
  })
