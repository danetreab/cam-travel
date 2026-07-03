import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function AttractionListCardSkeleton() {
  return (
    <Card className="flex w-full flex-row gap-3 rounded-lg p-3">
      <Skeleton className="h-20 w-20 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2 py-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-5 w-20" />
      </div>
    </Card>
  )
}
