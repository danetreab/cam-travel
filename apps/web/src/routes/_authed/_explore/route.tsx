import { createFileRoute, Outlet } from "@tanstack/react-router"
import { ExploreView } from "@/components/features/explore/explore-view"

// Pathless layout that keeps ExploreView mounted across both `/` and
// `/attraction/$attractionId`, so the modal renders over a live map and the
// viewport/state survives navigation.
export const Route = createFileRoute("/_authed/_explore")({
  component: ExploreLayout,
})

function ExploreLayout() {
  return (
    <>
      <ExploreView />
      <Outlet />
    </>
  )
}
