import { createFileRoute, Outlet } from "@tanstack/react-router"
import { z } from "zod"
import { ExploreView } from "@/components/features/explore/explore-view"

const exploreSearchSchema = z.object({
  // Set by the global search bar when the user picks a province. ExploreView
  // pans/zooms the map and narrows the attraction list to that province.
  province: z.string().optional(),
  // The live map viewport, written back by ExploreView as the user pans/zooms
  // so a refresh (or deep link) restores the camera instead of snapping back
  // to the default country view.
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  zoom: z.coerce.number().min(0).max(22).optional(),
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
