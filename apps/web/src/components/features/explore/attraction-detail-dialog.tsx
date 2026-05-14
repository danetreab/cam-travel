import { useEffect, useState } from "react"
import { ExternalLink, Share2, Star } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import Gallery from "@/components/ui/gallery"
import { useMediaQuery } from "@/hooks/use-media-query"
import type { Attraction, AttractionFile } from "@/types/attraction"
import { SaveAttractionButton } from "./save-attraction-button"

type GalleryItem = { src: string; alt: string; kind: "image" | "video" }
type GallerySection = { type?: "grid"; images: GalleryItem[] }

function toGalleryItem(file: AttractionFile, name: string): GalleryItem | null {
  if (file.mimetype.startsWith("image/")) {
    return { src: file.url, alt: name, kind: "image" }
  }
  if (file.mimetype.startsWith("video/")) {
    return { src: file.url, alt: name, kind: "video" }
  }
  return null
}

// Alternate hero (1 item) and grid (4 items) sections so each attraction gets
// the same visual rhythm regardless of photo count.
function buildSections(
  files: AttractionFile[],
  name: string,
): GallerySection[] {
  const items = files
    .map((f) => toGalleryItem(f, name))
    .filter((x): x is GalleryItem => x != null)
  const sections: GallerySection[] = []
  let i = 0
  let hero = true
  while (i < items.length) {
    if (hero) {
      sections.push({ images: [items[i]] })
      i += 1
    } else {
      sections.push({ type: "grid", images: items.slice(i, i + 4) })
      i += 4
    }
    hero = !hero
  }
  return sections
}

interface AttractionDetailDialogProps {
  attraction: Attraction | null
  isLoading?: boolean
  onOpenChange: (open: boolean) => void
}

function AttractionLoading() {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  )
}

function AttractionMeta({ attraction }: { attraction: Attraction }) {
  return (
    <span className="flex flex-wrap items-center gap-2 pt-1">
      {attraction.province && <span>{attraction.province}</span>}
      {attraction.cachedRating != null && (
        <>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
            {attraction.cachedRating.toFixed(1)}
            {attraction.cachedUserRatingsTotal != null && (
              <span className="ml-1">
                ({attraction.cachedUserRatingsTotal})
              </span>
            )}
          </span>
        </>
      )}
      {attraction.activityType && (
        <Badge variant="secondary">{attraction.activityType}</Badge>
      )}
    </span>
  )
}

function AttractionBody({
  attraction,
  galleryArmed,
}: {
  attraction: Attraction
  galleryArmed: boolean
}) {
  const sections = buildSections(attraction.files, attraction.name)
  return (
    <>
      {/*
        On mobile, the bottom sheet animates up under the user's finger after
        the pin tap. Without this guard the synthesized click lands on the
        hero image (wrapped in PhotoView) and opens the lightbox instead of
        showing details. Block pointer events until the open animation has
        settled.
      */}
      <div
        className={`mt-2 ${galleryArmed ? "" : "pointer-events-none"}`}
      >
        {sections.length === 0 ? (
          <div className="bg-muted text-muted-foreground flex h-72 items-center justify-center text-sm">
            No photos or videos yet
          </div>
        ) : (
          <Gallery sections={sections} />
        )}
      </div>

      {attraction.description && (
        <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
          {attraction.description}
        </p>
      )}
    </>
  )
}

async function shareAttraction(attraction: Attraction) {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/attraction/${attraction.id}`
      : `/attraction/${attraction.id}`
  // Use Web Share on platforms that support it (mostly mobile + Safari) so
  // the user picks their own target (Messages, AirDrop, etc.); fall back to
  // clipboard with a toast confirmation everywhere else.
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share({ title: attraction.name, url })
      return
    } catch (err) {
      // User-cancelled share — silent. Anything else falls through to copy.
      if (err instanceof Error && err.name === "AbortError") return
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    toast.success("Link copied")
  } catch {
    toast.error("Could not copy link")
  }
}

function AttractionActions({
  attraction,
  variant,
}: {
  attraction: Attraction
  variant: "inline" | "sticky"
}) {
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${attraction.latitude},${attraction.longitude}`

  if (variant === "sticky") {
    // Mobile action bar: three equal-weight buttons (Save, Share, Maps) at
    // the end of the sheet content. We intentionally don't `sticky bottom-0`
    // here — mobile browsers already render their own URL/tab bar at the
    // bottom, and stacking another floating bar on top of the gallery was
    // visually noisy. The buttons live inline at the end of the scroll, so
    // the user reaches them by scrolling past the photos.
    // Negative -mx-6 cancels SheetContent's px-6 so the bar spans full width
    // with its own bg; safe-area inset keeps it clear of the iOS home
    // indicator.
    return (
      <div className="bg-popover -mx-6 mt-4 flex items-stretch gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex-1 [&>button]:w-full">
          <SaveAttractionButton attractionId={attraction.id} />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => shareAttraction(attraction)}
        >
          <Share2 className="size-4" aria-hidden />
          Share
        </Button>
        <Button
          variant="default"
          size="sm"
          className="flex-1"
          render={<a href={mapsHref} target="_blank" rel="noreferrer" />}
        >
          <ExternalLink className="size-4" aria-hidden />
          Maps
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <SaveAttractionButton attractionId={attraction.id} />
      <Button
        variant="outline"
        size="sm"
        onClick={() => shareAttraction(attraction)}
      >
        <Share2 className="size-4" aria-hidden />
        Share
      </Button>
      <a
        href={mapsHref}
        target="_blank"
        rel="noreferrer"
        className="text-primary inline-flex items-center gap-1 text-sm underline"
      >
        Open in Google Maps
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  )
}

export function AttractionDetailDialog({
  attraction,
  isLoading = false,
  onOpenChange,
}: AttractionDetailDialogProps) {
  // Keep the breakpoint in sync with ExploreView so the same "mobile" rules
  // apply: tablets and up get the centered dialog, phones get a bottom sheet.
  const isDesktop = useMediaQuery("(min-width: 768px)")
  // Stay open while the route is mounted, even before data arrives — the
  // direct-link case (e.g. shared URL) hits the modal route with no cached
  // data, and closing the dialog while it loads would be jarring.
  const open = attraction != null || isLoading

  // Arm the gallery only after the open animation has settled. Without this,
  // tapping a pin on mobile lands the synthesized click on the freshly-rendered
  // hero image and immediately opens the photo lightbox.
  const [galleryArmed, setGalleryArmed] = useState(false)
  useEffect(() => {
    if (!open) {
      setGalleryArmed(false)
      return
    }
    if (isDesktop) {
      setGalleryArmed(true)
      return
    }
    const t = window.setTimeout(() => setGalleryArmed(true), 400)
    return () => window.clearTimeout(t)
  }, [open, isDesktop])

  if (!isDesktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[92svh] overflow-y-auto p-6 pt-8"
        >
          {attraction ? (
            <>
              <SheetHeader className="p-0">
                <SheetTitle className="text-xl normal-case tracking-normal">
                  {attraction.name}
                </SheetTitle>
                <SheetDescription>
                  <AttractionMeta attraction={attraction} />
                </SheetDescription>
              </SheetHeader>
              <AttractionBody
                attraction={attraction}
                galleryArmed={galleryArmed}
              />
              <AttractionActions attraction={attraction} variant="sticky" />
            </>
          ) : (
            <AttractionLoading />
          )}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[92vw] max-w-5xl overflow-y-auto sm:max-w-5xl">
        {attraction ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">{attraction.name}</DialogTitle>
              <DialogDescription>
                <AttractionMeta attraction={attraction} />
              </DialogDescription>
            </DialogHeader>
            <AttractionBody
              attraction={attraction}
              galleryArmed={galleryArmed}
            />
            <AttractionActions attraction={attraction} variant="inline" />
          </>
        ) : (
          <AttractionLoading />
        )}
      </DialogContent>
    </Dialog>
  )
}
