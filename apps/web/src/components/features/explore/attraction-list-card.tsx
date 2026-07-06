import {
  Bookmark,
  BookmarkCheck,
  Ellipsis,
  ExternalLink,
  ImageOff,
  Star,
} from "lucide-react"
import { useSaveAttraction } from "./save-attraction-button"
import type { Attraction } from "@/types/attraction"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
      <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)_auto] gap-3">
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
          <h3 className="line-clamp-1 text-sm leading-snug font-semibold">
            {attraction.name}
          </h3>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              {attraction.province ?? "Unknown province"}
            </p>
            {saved && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-primary">
                <BookmarkCheck className="size-3" />
                Saved
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end self-stretch">
          {attraction.cachedRating != null && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-muted/50 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-muted-foreground">
              <Star className="size-3 fill-current text-amber-500" />
              {attraction.cachedRating.toFixed(1)}
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className={cn(
                    "mt-auto size-7 rounded-md p-0 text-muted-foreground",
                    saved && "bg-primary/10 text-primary hover:text-primary"
                  )}
                />
              }
              aria-label="Attraction actions"
              aria-pressed={signedIn ? saved : undefined}
              onClick={(event) => event.stopPropagation()}
            >
              <Ellipsis className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-36 min-w-36 rounded-md"
            >
              <DropdownMenuItem
                disabled={isPending}
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
              </DropdownMenuItem>
              <DropdownMenuItem
                render={<a href={mapsHref} target="_blank" rel="noreferrer" />}
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink className="size-3.5" />
                Maps
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
