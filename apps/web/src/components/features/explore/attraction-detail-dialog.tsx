import { useEffect, useState } from "react"
import { Bookmark, ExternalLink, Share2, Star, X } from "lucide-react"
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
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import Gallery from "@/components/ui/gallery"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"
import type { Attraction, AttractionFile } from "@/types/attraction"
import {
  SaveAttractionButton,
  useSaveAttraction,
} from "./save-attraction-button"

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

// Single tab inside the iOS-style bottom bar. Vertical icon + label, full
// hit-area, subtle active/pressed styling. `as` lets a tab render as a link
// (Google Maps) or a button (Save / Share / Close).
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
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${attraction.latitude},${attraction.longitude}`

  return (
    <div className="border-t bg-popover/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] supports-backdrop-filter:bg-popover/80 supports-backdrop-filter:backdrop-blur">
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
  onPhotoVisibleChange,
}: {
  attraction: Attraction
  galleryArmed: boolean
  onPhotoVisibleChange?: (visible: boolean) => void
}) {
  const sections = buildSections(attraction.files, attraction.name)
  return (
    // `data-vaul-no-drag` tells the parent vaul Drawer to ignore pointer-
    // downs that originate inside the gallery — without it, tapping an image
    // gets interpreted as the start of a drag-to-dismiss gesture and the
    // PhotoView lightbox never opens. The galleryArmed guard still blocks
    // the synthesized click that lands on the hero image right after the
    // drawer animates in.
    <div
      data-vaul-no-drag
      className={`mt-2 ${galleryArmed ? "" : "pointer-events-none"}`}
    >
      {sections.length === 0 ? (
        <div className="bg-muted text-muted-foreground flex h-72 items-center justify-center text-sm">
          No photos or videos yet
        </div>
      ) : (
        <Gallery sections={sections} onVisibleChange={onPhotoVisibleChange} />
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

function AttractionActions({
  attraction,
  variant,
}: {
  attraction: Attraction
  variant: "inline" | "sticky"
}) {
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${attraction.latitude},${attraction.longitude}`

  if (variant === "sticky") {
    // Handled by AttractionTabBar below — the drawer pins it to the bottom
    // and pairs it with a Close tab outside this component.
    return null
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
  // While the PhotoView lightbox is open we disable vaul's drag-to-dismiss
  // and the swipe-down close gesture, so the swipe gestures on the
  // lightbox (next/prev photo, pinch-zoom) aren't interpreted as drawer
  // dismiss attempts.
  const [photoOpen, setPhotoOpen] = useState(false)
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
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        // Pause vaul's drag-to-dismiss while the photo lightbox is open so
        // its swipe gestures aren't stolen as drawer-close attempts.
        dismissible={!photoOpen}
      >
        {/*
          The vaul drawer ships with a drag-handle and rounded top. The body
          is a flex column: the top wrapper scrolls (title, gallery,
          description) while the iOS-style tab bar stays pinned at the
          bottom, like a native bottom navigation.
        */}
        <DrawerContent className="max-h-[92svh]">
          {attraction ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
                <DrawerHeader className="p-0 text-left">
                  <DrawerTitle className="text-xl normal-case tracking-normal">
                    {attraction.name}
                  </DrawerTitle>
                  <DrawerDescription>
                    <AttractionMeta attraction={attraction} />
                  </DrawerDescription>
                </DrawerHeader>
                <AttractionGallery
                  attraction={attraction}
                  galleryArmed={galleryArmed}
                  onPhotoVisibleChange={setPhotoOpen}
                />
                <AttractionDescription attraction={attraction} />
              </div>
              <AttractionTabBar
                attraction={attraction}
                onClose={() => onOpenChange(false)}
              />
            </div>
          ) : (
            <div className="px-6 pb-6">
              <AttractionLoading />
            </div>
          )}
        </DrawerContent>
      </Drawer>
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
            <AttractionGallery
              attraction={attraction}
              galleryArmed={galleryArmed}
            />
            <AttractionDescription attraction={attraction} />
            <AttractionActions attraction={attraction} variant="inline" />
          </>
        ) : (
          <AttractionLoading />
        )}
      </DialogContent>
    </Dialog>
  )
}
