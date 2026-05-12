import { createFileRoute } from "@tanstack/react-router"
import { ExploreView } from "@/components/features/explore/explore-view"

export const Route = createFileRoute("/_authed/")({ component: ExploreView })
