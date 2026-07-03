import { ImageOff, Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { Attraction } from "@/types/attraction"
import { cn } from "@/lib/utils"

interface AttractionListCardProps {
  attraction: Attraction
  active: boolean
  onClick: () => void
  onHover: () => void
  onLeave: () => void
}

function firstImage(a: Attraction): string | null {
  const thumb = a.files.find(
    (f) => f.mimetype.startsWith("image/") && f.thumbnailUrl,
  )
  if (thumb?.thumbnailUrl) return thumb.thumbnailUrl
  const full = a.files.find((f) => f.mimetype.startsWith("image/"))
  return full?.url ?? null
}

export function AttractionListCard({
  attraction,
  active,
  onClick,
  onHover,
  onLeave,
}: AttractionListCardProps) {
  const image = firstImage(attraction)

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        "group flex w-full cursor-pointer flex-row gap-3 rounded-lg p-3 transition-colors",
        "hover:bg-muted/60 focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
        active && "bg-primary/10 ring-primary/35 ring-2",
      )}
    >
      <div className="bg-muted h-20 w-20 shrink-0 overflow-hidden rounded-md">
        {image ? (
          <img
            src={image}
            alt={attraction.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center">
            <ImageOff className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-medium">{attraction.name}</h3>
          {attraction.cachedRating != null && (
            <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap">
              <Star className="h-3 w-3 fill-current" aria-hidden />
              {attraction.cachedRating.toFixed(1)}
              {attraction.cachedUserRatingsTotal != null && (
                <span className="text-muted-foreground">
                  ({attraction.cachedUserRatingsTotal})
                </span>
              )}
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-0.5 truncate text-xs">
          {attraction.province ?? "—"}
        </p>
        {attraction.activityType && (
          <Badge variant="secondary" className="mt-1.5">
            {attraction.activityType}
          </Badge>
        )}
      </div>
    </Card>
  )
}
