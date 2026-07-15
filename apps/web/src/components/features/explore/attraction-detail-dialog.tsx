import { useEffect, useMemo, useState } from "react"
import { Bookmark, ExternalLink, Share2, Star, X } from "lucide-react"
import { toast } from "sonner"
import {
  SaveAttractionButton,
  useSaveAttraction,
} from "./save-attraction-button"
import type { GalleryItem, GallerySection } from "@/components/ui/gallery"
import type { Attraction, AttractionFile } from "@/types/attraction"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import Gallery from "@/components/ui/gallery"
import { Lightbox, type LightboxImage } from "@/components/ui/lightbox"
import { useMediaQuery } from "@/hooks/use-media-query"
import { getGoogleMapsPlaceUrl } from "@/lib/google-maps"
import { cn } from "@/lib/utils"

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
  files: Array<AttractionFile>,
  name: string,
): Array<GallerySection> {
  const items = files
    .map((f) => toGalleryItem(f, name))
    .filter((x): x is GalleryItem => x != null)
  const sections: Array<GallerySection> = []
  let i = 0
  let hero = true
  while (i < items.length) {
    if (hero) {
      sections.push({ items: [items[i]] })
      i += 1
    } else {
      sections.push({ type: "grid", items: items.slice(i, i + 4) })
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

function TabBarTab({
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
  href,
  className,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  href?: string
  className?: string
}) {
  const inner = (
    <>
      <span aria-hidden className="flex h-6 w-6 items-center justify-center">
        {icon}
      </span>
      <span className="text-[10px] leading-none tracking-wide">{label}</span>
    </>
  )

  const base = cn(
    "flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors",
    active ? "text-primary" : "text-muted-foreground",
    !disabled && "active:bg-muted/40",
    disabled && "opacity-50",
    className,
  )

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={base}
        aria-label={label}
      >
        {inner}
      </a>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={base}
      aria-label={label}
      aria-pressed={active || undefined}
    >
      {inner}
    </button>
  )
}

function AttractionTabBar({
  attraction,
  onClose,
}: {
  attraction: Attraction
  onClose: () => void
}) {
  const save = useSaveAttraction(attraction.id)
  const mapsHref = getGoogleMapsPlaceUrl(attraction)

  return (
    <div className="glass-panel border-x-0 border-b-0 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-md items-stretch">
        <TabBarTab
          icon={
            <Bookmark
              className="size-5"
              fill={save.saved ? "currentColor" : "none"}
            />
          }
          label={save.saved ? "Saved" : "Save"}
          active={save.saved}
          disabled={save.isPending}
          onClick={save.toggle}
        />
        <TabBarTab
          icon={<Share2 className="size-5" />}
          label="Share"
          onClick={() => shareAttraction(attraction)}
        />
        <TabBarTab
          icon={<ExternalLink className="size-5" />}
          label="Maps"
          href={mapsHref}
        />
        <TabBarTab
          icon={<X className="size-5" />}
          label="Close"
          onClick={onClose}
        />
      </div>
    </div>
  )
}

function AttractionGallery({
  attraction,
  galleryArmed,
  onOpenImage,
}: {
  attraction: Attraction
  galleryArmed: boolean
  onOpenImage: (imageIndex: number) => void
}) {
  const sections = buildSections(attraction.files, attraction.name)
  return (
    // `galleryArmed` swallows the synthesized click that lands here right
    // after the page mounts (from the same tap that opened the route — the
    // ~300ms ghost click otherwise lands on the freshly-rendered hero image
    // and immediately opens the lightbox).
    <div className={cn("mt-2", !galleryArmed && "pointer-events-none")}>
      {sections.length === 0 ? (
        <div className="flex h-72 items-center justify-center rounded-lg bg-muted/70 text-sm text-muted-foreground">
          No photos or videos yet
        </div>
      ) : (
        <Gallery sections={sections} onOpenImage={onOpenImage} />
      )}
    </div>
  )
}

function AttractionDescription({ attraction }: { attraction: Attraction }) {
  if (!attraction.description) return null
  return (
    <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
      {attraction.description}
    </p>
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

function AttractionInlineActions({ attraction }: { attraction: Attraction }) {
  const mapsHref = getGoogleMapsPlaceUrl(attraction)
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

// Body content shared by both the mobile full-screen page and the desktop
// dialog: title, gallery, description. The action surface (tab bar vs inline
// buttons) is rendered by the wrapper since it needs to know about the close
// affordance.
function AttractionBody({
  attraction,
  galleryArmed,
  onOpenImage,
}: {
  attraction: Attraction
  galleryArmed: boolean
  onOpenImage: (imageIndex: number) => void
}) {
  return (
    <>
      <AttractionGallery
        attraction={attraction}
        galleryArmed={galleryArmed}
        onOpenImage={onOpenImage}
      />
      <AttractionDescription attraction={attraction} />
    </>
  )
}

export function AttractionDetailDialog({
  attraction,
  isLoading = false,
  onOpenChange,
}: AttractionDetailDialogProps) {
  // Tablets and up get the centered Dialog; phones get a dedicated full-
  // screen page. Two surfaces, no shared modal wrapper, no vaul gesture
  // arbitration to fight with the photo lightbox.
  const isDesktop = useMediaQuery("(min-width: 768px)")
  // Stay open while the route is mounted, even before data arrives — the
  // direct-link case (e.g. shared URL) hits the modal route with no cached
  // data, and closing the dialog while it loads would be jarring.
  const open = attraction != null || isLoading

  // See AttractionGallery for why this exists.
  const [galleryArmed, setGalleryArmed] = useState(false)
  // Lightbox state lives here so the lightbox can be a sibling of the modal
  // surface — keeps its synthetic events out of the surrounding React tree
  // and prevents any parent gesture handlers from intercepting taps on it.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const lightboxImages = useMemo<LightboxImage[]>(() => {
    if (!attraction) return []
    return attraction.files
      .filter((f) => f.mimetype.startsWith("image/"))
      .map((f) => ({ src: f.url, alt: attraction.name }))
  }, [attraction])

  useEffect(() => {
    if (!open) {
      setGalleryArmed(false)
      setLightboxIndex(null)
      return
    }
    if (isDesktop) {
      setGalleryArmed(true)
      return
    }
    const t = window.setTimeout(() => setGalleryArmed(true), 250)
    return () => window.clearTimeout(t)
  }, [open, isDesktop])

  // ESC closes the mobile full-screen page. Lightbox owns its own ESC and
  // is checked first so closing the lightbox doesn't also dismiss the page.
  useEffect(() => {
    if (isDesktop || !open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && lightboxIndex === null) onOpenChange(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isDesktop, open, lightboxIndex, onOpenChange])

  // Lock body scroll while the mobile page is up (Dialog already does this
  // on desktop). Prevents the layer behind from scrolling on rubber-band.
  useEffect(() => {
    if (isDesktop || !open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [isDesktop, open])

  const lightbox = (
    <Lightbox
      images={lightboxImages}
      index={lightboxIndex}
      onClose={() => setLightboxIndex(null)}
      onIndexChange={setLightboxIndex}
    />
  )

  if (!isDesktop) {
    if (!open) return null
    return (
      <>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={attraction?.name ?? "Attraction details"}
          className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          {/* Sticky header so the title + close X stay accessible while
              the body scrolls. Safe-area padding handles iOS notches. */}
          <header className="glass-panel sticky top-0 z-10 flex items-start gap-3 border-x-0 border-t-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
            <div className="min-w-0 flex-1">
              {attraction ? (
                <>
                  <h1 className="truncate text-base font-semibold leading-tight">
                    {attraction.name}
                  </h1>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    <AttractionMeta attraction={attraction} />
                  </div>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Loading…</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="-mr-1 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground active:bg-muted/60"
            >
              <X className="size-5" />
            </button>
          </header>

          <main className="flex-1 overflow-y-auto px-4 pb-6">
            {attraction ? (
              <AttractionBody
                attraction={attraction}
                galleryArmed={galleryArmed}
                onOpenImage={setLightboxIndex}
              />
            ) : (
              <AttractionLoading />
            )}
          </main>

          {attraction && (
            <AttractionTabBar
              attraction={attraction}
              onClose={() => onOpenChange(false)}
            />
          )}
        </div>
        {lightbox}
      </>
    )
  }

  return (
    <>
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
                onOpenImage={setLightboxIndex}
              />
              <AttractionInlineActions attraction={attraction} />
            </>
          ) : (
            <AttractionLoading />
          )}
        </DialogContent>
      </Dialog>
      {lightbox}
    </>
  )
}
