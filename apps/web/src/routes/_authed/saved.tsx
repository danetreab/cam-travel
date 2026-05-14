import { createFileRoute, redirect } from "@tanstack/react-router"
import { SavedView } from "@/components/features/saved/saved-view"
import { authQueryOptions } from "@/queries/auth.query"
import { savedAttractionsListQueryOptions } from "@/queries/saved-attractions.query"

export const Route = createFileRoute("/_authed/saved")({
  component: SavedView,
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData({
      ...authQueryOptions(),
      revalidateIfStale: true,
    })
    if (!session?.session) {
      throw redirect({ to: "/login", search: { redirect: location.href } })
    }
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(savedAttractionsListQueryOptions()),
})
