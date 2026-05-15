import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bookmark } from "lucide-react"
import { toast } from "sonner"

import { saveAttraction, unsaveAttraction } from "@/api/attractions.api"
import { Button } from "@/components/ui/button"
import { useLoginDialog } from "@/components/features/login/login-dialog"
import { authQueryOptions } from "@/queries/auth.query"
import {
  savedAttractionIdsQueryOptions,
  savedAttractionsListQueryOptions,
} from "@/queries/saved-attractions.query"

interface SaveAttractionButtonProps {
  attractionId: string
}

// Shared save state + toggle for any view that wants to render its own UI on
// top of it (the regular button below, plus the iOS-style tab in the mobile
// drawer footer). Returns `signedIn` so callers can decide between toggling
// the save and prompting sign-in.
export function useSaveAttraction(attractionId: string) {
  const queryClient = useQueryClient()
  const auth = useQuery(authQueryOptions())
  const signedIn = !!auth.data?.session

  const ids = useQuery({
    ...savedAttractionIdsQueryOptions(),
    enabled: signedIn,
  })
  const saved = !!ids.data?.includes(attractionId)

  const idsKey = savedAttractionIdsQueryOptions().queryKey
  const listKey = savedAttractionsListQueryOptions().queryKey

  const mutation = useMutation({
    mutationFn: async (next: boolean) =>
      next ? saveAttraction(attractionId) : unsaveAttraction(attractionId),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: idsKey })
      const prev = queryClient.getQueryData<string[]>(idsKey) ?? []
      const optimistic = next
        ? Array.from(new Set([...prev, attractionId]))
        : prev.filter((id) => id !== attractionId)
      queryClient.setQueryData(idsKey, optimistic)
      return { prev }
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(idsKey, ctx.prev)
      toast.error("Could not update saved pins")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: idsKey })
      queryClient.invalidateQueries({ queryKey: listKey })
    },
  })

  const loginDialog = useLoginDialog()

  const toggle = () => {
    if (!signedIn) return loginDialog.open()
    mutation.mutate(!saved)
  }

  return {
    signedIn,
    saved,
    isPending: mutation.isPending,
    toggle,
  }
}

export function SaveAttractionButton({
  attractionId,
}: SaveAttractionButtonProps) {
  const { signedIn, saved, isPending, toggle } = useSaveAttraction(attractionId)

  return (
    <Button
      variant={saved ? "default" : "outline"}
      size="sm"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={signedIn ? saved : undefined}
    >
      <Bookmark
        className="size-4"
        fill={saved ? "currentColor" : "none"}
        aria-hidden
      />
      {saved ? "Saved" : "Save"}
    </Button>
  )
}
