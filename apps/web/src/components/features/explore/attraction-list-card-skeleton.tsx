import { Skeleton } from "@/components/ui/skeleton"

export function AttractionListCardSkeleton() {
  return (
    <div className="w-full rounded-lg border border-border/70 bg-background p-2.5">
      <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
        <Skeleton className="size-14 shrink-0 rounded-md bg-muted/70" />
        <div className="min-w-0 space-y-2 py-0.5">
          <Skeleton className="h-4 w-3/4 bg-muted/70" />
          <Skeleton className="h-3 w-1/3 bg-muted/70" />
          <div className="flex gap-1.5 pt-0.5">
            <Skeleton className="h-7 w-16 rounded-md bg-muted/70" />
            <Skeleton className="h-7 w-16 rounded-md bg-muted/70" />
          </div>
        </div>
      </div>
    </div>
  )
}
