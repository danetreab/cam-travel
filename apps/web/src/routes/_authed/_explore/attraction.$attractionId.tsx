import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

import { AttractionDetailView } from "@/components/features/explore/attraction-detail-view"
import { attractionByIdQueryOptions } from "@/queries/attractions.query"

export const Route = createFileRoute("/_authed/_explore/attraction/$attractionId")({
  component: AttractionRoute,
  // Fire-and-forget the prefetch — don't return the promise. If we returned
  // it, TanStack Router would await it before mounting the route, so on
  // mobile a tap on a pin would sit silent until the network round-trip
  // finished. By not awaiting, the route mounts instantly and the in-
  // component useQuery (same key, request coalesced) drives the loading
  // state inside MobileShell. Still using prefetch (not ensure) so an
  // unauthenticated SSR call can't crash the render — auth cookies aren't
  // forwarded server-side.
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(
      attractionByIdQueryOptions(params.attractionId),
    )
  },
})

function AttractionRoute() {
  const { attractionId } = Route.useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useQuery(attractionByIdQueryOptions(attractionId))

  return (
    <AttractionDetailView
      attraction={data ?? null}
      isLoading={isLoading}
      onOpenChange={(open) => {
        if (!open) navigate({ to: "/" })
      }}
    />
  )
}
