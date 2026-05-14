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

export function SaveAttractionButton({
  attractionId,
}: SaveAttractionButtonProps) {
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

  if (!signedIn) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          toast("Sign in to save", {
            action: {
              label: "Sign in",
              onClick: () => loginDialog.open(),
            },
          })
        }
      >
        <Bookmark className="size-4" fill="none" aria-hidden />
        Save
      </Button>
    )
  }

  return (
    <Button
      variant={saved ? "default" : "outline"}
      size="sm"
      onClick={() => mutation.mutate(!saved)}
      disabled={mutation.isPending}
      aria-pressed={saved}
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
