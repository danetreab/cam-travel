import { createFileRoute } from "@tanstack/react-router"

import { PlannerPlaceRouteDialog } from "@/components/features/planner/travel-planner-view"

export const Route = createFileRoute(
  "/_authed/planner/place/$googlePlaceId_/modal"
)({
  component: PlannerPlaceModalRoute,
})

function PlannerPlaceModalRoute() {
  const { googlePlaceId } = Route.useParams()
  return <PlannerPlaceRouteDialog googlePlaceId={googlePlaceId} />
}
