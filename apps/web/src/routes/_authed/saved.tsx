import { createFileRoute } from "@tanstack/react-router"
import { SavedView } from "@/components/features/saved/saved-view"
import { savedAttractionsListQueryOptions } from "@/queries/saved-attractions.query"

export const Route = createFileRoute("/_authed/saved")({
  component: SavedView,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(savedAttractionsListQueryOptions()),
})
