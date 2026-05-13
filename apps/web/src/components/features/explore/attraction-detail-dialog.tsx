import { ExternalLink, Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
  onOpenChange: (open: boolean) => void
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

function AttractionBody({ attraction }: { attraction: Attraction }) {
  const sections = buildSections(attraction.files, attraction.name)
  return (
    <>
      <div className="mt-2">
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

      <a
        href={`https://www.google.com/maps/search/?api=1&query=${attraction.latitude},${attraction.longitude}`}
        target="_blank"
        rel="noreferrer"
        className="text-primary mt-4 inline-flex items-center gap-1 text-sm underline"
      >
        Open in Google Maps
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    </>
  )
}

export function AttractionDetailDialog({
  attraction,
  onOpenChange,
}: AttractionDetailDialogProps) {
  // Keep the breakpoint in sync with ExploreView so the same "mobile" rules
  // apply: tablets and up get the centered dialog, phones get a bottom sheet.
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const open = attraction != null

  if (!isDesktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[92svh] overflow-y-auto p-6 pt-8"
        >
          {attraction && (
            <>
              <SheetHeader className="p-0">
                <SheetTitle className="text-xl normal-case tracking-normal">
                  {attraction.name}
                </SheetTitle>
                <SheetDescription>
                  <AttractionMeta attraction={attraction} />
                </SheetDescription>
              </SheetHeader>
              <AttractionBody attraction={attraction} />
            </>
          )}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {attraction && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">{attraction.name}</DialogTitle>
              <DialogDescription>
                <AttractionMeta attraction={attraction} />
              </DialogDescription>
            </DialogHeader>
            <AttractionBody attraction={attraction} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
