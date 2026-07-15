import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  Bookmark,
  ExternalLink,
  Share2,
  Star,
  X,
} from "lucide-react"
import { PhotoSlider } from "react-photo-view"
import "react-photo-view/dist/react-photo-view.css"
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
import Gallery, {
  type GalleryItem,
  type GallerySection,
} from "@/components/ui/gallery"
import { Spinner } from "@/components/ui/spinner"
import { useMediaQuery } from "@/hooks/use-media-query"
import { getGoogleMapsPlaceUrl } from "@/lib/google-maps"
import { cn } from "@/lib/utils"
import type { Attraction, AttractionFile } from "@/types/attraction"
import {
  SaveAttractionButton,
  useSaveAttraction,
} from "./save-attraction-button"

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

interface AttractionDetailViewProps {
  attraction: Attraction | null
  isLoading?: boolean
  onOpenChange: (open: boolean) => void
}

// Fills the available column with a centered spinner — used by both the
// mobile shell (where it occupies the entire scrollable area after a pin
// tap) and the desktop dialog. Mobile users tap a pin and see this
// immediately, so it has to look intentional, not "blank screen".
function AttractionLoading() {
  return (
    <div className="flex flex-1 min-h-[12rem] items-center justify-center py-12 text-muted-foreground">
      <Spinner className="size-8" />
    </div>
  )
}

function AttractionMeta({ attraction }: { attraction: Attraction }) {
  return (
    <span className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
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
        <Badge variant="secondary" className="ml-1">
          {attraction.activityType}
        </Badge>
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
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  href?: string
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
  onOpenImage,
}: {
  attraction: Attraction
  onOpenImage: (imageIndex: number) => void
}) {
  const sections = buildSections(attraction.files, attraction.name)
  if (sections.length === 0) {
    return (
      <div className="mt-2 flex h-72 items-center justify-center rounded-lg bg-muted/70 text-sm text-muted-foreground">
        No photos or videos yet
      </div>
    )
  }
  return (
    <div className="mt-2">
      <Gallery sections={sections} onOpenImage={onOpenImage} />
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
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share({ title: attraction.name, url })
      return
    } catch (err) {
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

function DesktopActions({ attraction }: { attraction: Attraction }) {
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

// Full-screen mobile shell. Replaces the previous vaul Drawer entirely:
// since vaul installed document-level pointer/touch handlers, every
// react-photo-view gesture had to fight it. Without vaul, the lightbox
// just works.
function MobileShell({
  attraction,
  isLoading,
  onClose,
  onOpenImage,
}: {
  attraction: Attraction | null
  isLoading: boolean
  onClose: () => void
  onOpenImage: (imageIndex: number) => void
}) {
  // Lock the body so the page underneath (map) doesn't scroll while the
  // detail view is up. Keep this scoped to mount — the cleanup restores
  // whatever the body had before.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // ESC closes — matches the desktop Dialog behavior so the close affordance
  // is consistent across breakpoints when a hardware keyboard is attached.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attraction?.name ?? "Attraction details"}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      <header className="glass-panel sticky top-0 z-10 flex items-center gap-2 border-x-0 border-t-0 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="-ml-1 rounded-lg p-2 text-foreground active:bg-muted/60"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          {attraction ? (
            <>
              <h1 className="truncate text-base font-semibold leading-tight">
                {attraction.name}
              </h1>
              <AttractionMeta attraction={attraction} />
            </>
          ) : (
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {attraction ? (
          <>
            <AttractionGallery
              attraction={attraction}
              onOpenImage={onOpenImage}
            />
            <AttractionDescription attraction={attraction} />
          </>
        ) : isLoading ? (
          <AttractionLoading />
        ) : null}
      </main>

      {attraction && (
        <AttractionTabBar attraction={attraction} onClose={onClose} />
      )}
    </div>
  )
}

export function AttractionDetailView({
  attraction,
  isLoading = false,
  onOpenChange,
}: AttractionDetailViewProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  // Stay open while the route is mounted, even before data arrives — direct-
  // link case (shared URL) hits with no cached data and closing during load
  // would be jarring.
  const open = attraction != null || isLoading

  // Lightbox state lives here; the slider itself renders as a sibling of
  // the shell so its events never bubble through any modal library's React
  // tree (no gesture conflicts).
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const lightboxImages = useMemo(() => {
    if (!attraction) return []
    return attraction.files
      .filter((f) => f.mimetype.startsWith("image/"))
      .map((f, i) => ({ key: i, src: f.url }))
  }, [attraction])

  useEffect(() => {
    if (!open) setLightboxOpen(false)
  }, [open])

  const openLightboxAt = (index: number) => {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  const close = () => onOpenChange(false)

  const lightbox = (
    <PhotoSlider
      images={lightboxImages}
      index={lightboxIndex}
      onIndexChange={setLightboxIndex}
      visible={lightboxOpen}
      onClose={() => setLightboxOpen(false)}
    />
  )

  if (!open) return lightbox

  if (!isDesktop) {
    return (
      <>
        <MobileShell
          attraction={attraction}
          isLoading={isLoading}
          onClose={close}
          onOpenImage={openLightboxAt}
        />
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
              <AttractionGallery
                attraction={attraction}
                onOpenImage={openLightboxAt}
              />
              <AttractionDescription attraction={attraction} />
              <DesktopActions attraction={attraction} />
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
