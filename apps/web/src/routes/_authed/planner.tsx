import { createFileRoute, redirect } from "@tanstack/react-router"
import { TravelPlannerView } from "@/components/features/planner/travel-planner-view"
import { authQueryOptions } from "@/queries/auth.query"

export const Route = createFileRoute("/_authed/planner")({
  component: TravelPlannerView,
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData({
      ...authQueryOptions(),
      revalidateIfStale: true,
    })
    if (!session?.session) {
      throw redirect({ to: "/login", search: { redirect: location.href } })
    }
  },
})
