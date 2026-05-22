import { createFileRoute, Outlet } from "@tanstack/react-router"
import { z } from "zod"
import { ExploreView } from "@/components/features/explore/explore-view"

const exploreSearchSchema = z.object({
  // Set by the global search bar when the user picks a province. ExploreView
  // pans/zooms the map and narrows the attraction list to that province.
  province: z.string().optional(),
})

// Pathless layout that keeps ExploreView mounted across both `/` and
// `/attraction/$attractionId`, so the modal renders over a live map and the
// viewport/state survives navigation.
export const Route = createFileRoute("/_authed/_explore")({
  component: ExploreLayout,
  validateSearch: (search) => exploreSearchSchema.parse(search),
})

function ExploreLayout() {
  return (
    <>
      <ExploreView />
      <Outlet />
    </>
  )
}
