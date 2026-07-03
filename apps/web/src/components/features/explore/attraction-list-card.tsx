import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  ImageOff,
  Star,
} from "lucide-react"
import { useSaveAttraction } from "./save-attraction-button"
import type { Attraction } from "@/types/attraction"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface AttractionListCardProps {
  attraction: Attraction
  active: boolean
  selected?: boolean
  onClick: () => void
  onHover: () => void
  onLeave: () => void
}

function firstImage(a: Attraction): string | null {
  const thumb = a.files.find(
    (f) => f.mimetype.startsWith("image/") && f.thumbnailUrl
  )
  if (thumb?.thumbnailUrl) return thumb.thumbnailUrl
  const full = a.files.find((f) => f.mimetype.startsWith("image/"))
  return full?.url ?? null
}

export function AttractionListCard({
  attraction,
  active,
  selected = active,
  onClick,
  onHover,
  onLeave,
}: AttractionListCardProps) {
  const image = firstImage(attraction)
  const { signedIn, saved, isPending, toggle } = useSaveAttraction(
    attraction.id
  )
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${attraction.latitude},${attraction.longitude}`
  const actionClassName =
    "h-7 rounded-md px-2.5 text-xs font-medium normal-case tracking-normal"

  return (
    <div
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
      aria-pressed={selected}
      data-active={active}
      data-selected={selected}
      className={cn(
        "rounded-lg border border-border/70 bg-background p-2.5 text-sm transition-colors",
        "hover:border-border hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
        selected && "border-primary/45 bg-primary/5"
      )}
    >
      <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
        <div className="planner-place-image size-14 shrink-0 overflow-hidden rounded-md">
          {image ? (
            <img
              src={image}
              alt={attraction.name}
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <ImageOff className="size-4" />
            </div>
          )}
        </div>
        <div className="min-w-0 text-left">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 text-sm leading-snug font-semibold">
              {attraction.name}
            </h3>
            {attraction.cachedRating != null && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                <Star
                  className="size-3 fill-current text-amber-500"
                  aria-hidden
                />
                {attraction.cachedRating.toFixed(1)}
                {attraction.cachedUserRatingsTotal != null && (
                  <span className="font-normal">
                    ({attraction.cachedUserRatingsTotal.toLocaleString()})
                  </span>
                )}
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {attraction.province ?? "Unknown province"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="xs"
              variant={saved ? "secondary" : "outline"}
              className={actionClassName}
              disabled={isPending}
              aria-pressed={signedIn ? saved : undefined}
              onClick={(event) => {
                event.stopPropagation()
                toggle()
              }}
            >
              {saved ? (
                <BookmarkCheck className="size-3.5" />
              ) : (
                <Bookmark className="size-3.5" />
              )}
              {saved ? "Saved" : "Save"}
            </Button>
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({
                size: "xs",
                variant: "ghost",
                className: cn(actionClassName, "text-muted-foreground"),
              })}
              onClick={(event) => event.stopPropagation()}
            >
              <ExternalLink className="size-3.5" />
              Maps
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
