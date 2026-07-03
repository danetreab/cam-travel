import { envClient } from "@/env"
import type {
  AiTravelRequest,
  AiTravelResponse,
  AiTravelSessionDetail,
  AiTravelSessionSummary,
} from "@/types/ai-travel"

const AI_TIMEOUT_MS = 45000

async function aiFetch<T>(
  path: string,
  init: Omit<RequestInit, "credentials" | "signal"> = {},
): Promise<T> {
  const res = await fetch(`${envClient.VITE_API_URL}${path}`, {
    ...init,
    credentials: "include",
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  })

  if (!res.ok) {
    let message = `Network error ${res.status}`
    try {
      const json = (await res.json()) as { message?: string | string[] }
      if (Array.isArray(json.message)) message = json.message.join("; ")
      else if (json.message) message = json.message
    } catch {
      // keep status fallback
    }
    throw new Error(message)
  }

  return (await res.json()) as T
}

export function planAiTravel(
  request: AiTravelRequest,
): Promise<AiTravelResponse> {
  return aiFetch<AiTravelResponse>("/api/v1/ai/travel", {
    method: "POST",
    body: JSON.stringify(request),
  })
}

export function getAiTravelPlan(planId: string): Promise<AiTravelResponse> {
  return aiFetch<AiTravelResponse>(
    `/api/v1/ai/plans/${encodeURIComponent(planId)}`,
  )
}

export function listAiTravelSessions(): Promise<AiTravelSessionSummary[]> {
  return aiFetch<AiTravelSessionSummary[]>("/api/v1/ai/sessions")
}

export function getAiTravelSession(
  sessionId: string,
): Promise<AiTravelSessionDetail> {
  return aiFetch<AiTravelSessionDetail>(
    `/api/v1/ai/sessions/${encodeURIComponent(sessionId)}`,
  )
}

export function patchAiTravelPlanPlace(
  planId: string,
  googlePlaceId: string,
  patch: { saved?: boolean; removed?: boolean },
): Promise<AiTravelResponse> {
  return aiFetch<AiTravelResponse>(
    `/api/v1/ai/plans/${encodeURIComponent(planId)}/places/${encodeURIComponent(
      googlePlaceId,
    )}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  )
}
