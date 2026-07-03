import { createFileRoute, redirect } from "@tanstack/react-router"
import { z } from "zod"
import { TravelPlannerView } from "@/components/features/planner/travel-planner-view"
import { authQueryOptions } from "@/queries/auth.query"

const plannerSearchSchema = z.object({
  sid: z.string().optional(),
  planId: z.string().optional(),
  selected: z.string().optional(),
  chat: z.string().optional(),
})

export const Route = createFileRoute("/_authed/planner")({
  component: TravelPlannerView,
  validateSearch: (search) => plannerSearchSchema.parse(search),
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
