import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

import { AttractionDetailDialog } from "@/components/features/explore/attraction-detail-dialog"
import { attractionByIdQueryOptions } from "@/queries/attractions.query"

export const Route = createFileRoute("/_authed/_explore/attraction/$attractionId")({
  component: AttractionRoute,
  // prefetch (not ensure) so SSR survives an unauthenticated upstream call —
  // the GraphQL endpoint needs auth cookies that aren't forwarded during SSR,
  // and we don't want a 401 there to crash the render. The client-side
  // useQuery in the component refetches with cookies after hydration.
  loader: ({ context, params }) =>
    context.queryClient.prefetchQuery(
      attractionByIdQueryOptions(params.attractionId),
    ),
})

function AttractionRoute() {
  const { attractionId } = Route.useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useQuery(attractionByIdQueryOptions(attractionId))

  return (
    <AttractionDetailDialog
      attraction={data ?? null}
      isLoading={isLoading}
      onOpenChange={(open) => {
        if (!open) navigate({ to: "/" })
      }}
    />
  )
}
