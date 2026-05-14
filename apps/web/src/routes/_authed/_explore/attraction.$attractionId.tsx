import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

import { AttractionDetailDialog } from "@/components/features/explore/attraction-detail-dialog"
import { attractionByIdQueryOptions } from "@/queries/attractions.query"

export const Route = createFileRoute("/_authed/_explore/attraction/$attractionId")({
  component: AttractionRoute,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      attractionByIdQueryOptions(params.attractionId),
    ),
})

function AttractionRoute() {
  const { attractionId } = Route.useParams()
  const navigate = useNavigate()
  const { data } = useQuery(attractionByIdQueryOptions(attractionId))

  return (
    <AttractionDetailDialog
      attraction={data ?? null}
      onOpenChange={(open) => {
        if (!open) navigate({ to: "/" })
      }}
    />
  )
}
