import { createFileRoute } from "@tanstack/react-router"

// Map view with no modal — the `_explore` layout already renders ExploreView.
export const Route = createFileRoute("/_authed/_explore/")({
  component: () => null,
})
