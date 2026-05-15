import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { cn } from "@/lib/utils"

export type LightboxImage = {
  src: string
  alt: string
}

interface LightboxProps {
  images: LightboxImage[]
  index: number | null
  onClose: () => void
  onIndexChange: (i: number) => void
}

// Threshold (in px) past which a horizontal drag pages images and a downward
// drag dismisses the viewer. Picked by feel — small enough that a casual
// flick registers, large enough that a tap-with-jitter doesn't.
const SWIPE_THRESHOLD = 50

// Self-contained full-screen image viewer rendered via a portal at
// document.body, so its DOM lives outside whatever overlay/drawer triggered
// it. The component should be mounted as a sibling of any parent gesture
// handler (vaul drawer, etc.) — not as its descendant — so React synthetic
// events from inside the viewer don't bubble back into those handlers.
export function Lightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: LightboxProps) {
  const isOpen = index !== null
  // Live drag offset so the image follows the finger before we decide
  // whether the gesture is a page or a dismiss. Reset on touch end.
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!isOpen || index === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1)
      else if (e.key === "ArrowRight" && index < images.length - 1)
        onIndexChange(index + 1)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [isOpen, index, images.length, onClose, onIndexChange])

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  if (!isOpen || index === null) return null
  const current = images[index]
  if (!current) return null

  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (index > 0) onIndexChange(index - 1)
  }
  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (index < images.length - 1) onIndexChange(index + 1)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation()
    if (e.touches.length !== 1) return
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    setDrag({ dx: 0, dy: 0 })
  }

  const onTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation()
    const start = touchStart.current
    if (!start || e.touches.length !== 1) return
    const dx = e.touches[0].clientX - start.x
    const dy = e.touches[0].clientY - start.y
    setDrag({ dx, dy })
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation()
    const start = touchStart.current
    touchStart.current = null
    setDrag(null)
    if (!start) return
    const dx = (e.changedTouches[0]?.clientX ?? start.x) - start.x
    const dy = (e.changedTouches[0]?.clientY ?? start.y) - start.y
    // Vertical swipe-down dismisses; checked first so a slight horizontal
    // wobble while pulling down doesn't get re-interpreted as paging.
    if (dy > SWIPE_THRESHOLD && dy > Math.abs(dx)) {
      onClose()
      return
    }
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0 && index < images.length - 1) onIndexChange(index + 1)
      else if (dx > 0 && index > 0) onIndexChange(index - 1)
    }
  }

  // While dragging, fade the backdrop in proportion to vertical pull so the
  // dismiss gesture feels coupled to the user's finger. Cap at 60% to keep
  // the image legible.
  const dragOpacity = drag
    ? Math.max(0.4, 1 - Math.min(0.6, Math.abs(drag.dy) / 400))
    : 1
  const imageTransform = drag
    ? `translate3d(${drag.dx}px, ${Math.max(0, drag.dy)}px, 0)`
    : undefined

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.alt}
      className="fixed inset-0 z-[100] flex items-center justify-center select-none"
      style={{ backgroundColor: `rgba(0, 0, 0, ${0.95 * dragOpacity})` }}
      // Tapping the dim backdrop dismisses; image taps are stopped below.
      onClick={onClose}
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <img
        src={current.src}
        alt={current.alt}
        draggable={false}
        className={cn(
          "max-h-[90vh] max-w-[95vw] object-contain",
          drag ? "transition-none" : "transition-transform duration-200",
        )}
        style={{ transform: imageTransform }}
        onClick={stop}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="absolute right-3 inline-flex size-10 items-center justify-center bg-black/60 text-white hover:bg-black/80"
        style={{ top: `max(0.75rem, env(safe-area-inset-top))` }}
        aria-label="Close"
      >
        <X className="size-5" />
      </button>
      {index > 0 && (
        <button
          type="button"
          onClick={goPrev}
          className="absolute left-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center bg-black/50 text-white hover:bg-black/70 md:inline-flex"
          aria-label="Previous image"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      {index < images.length - 1 && (
        <button
          type="button"
          onClick={goNext}
          className="absolute right-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center bg-black/50 text-white hover:bg-black/70 md:inline-flex"
          aria-label="Next image"
        >
          <ChevronRight className="size-6" />
        </button>
      )}
      {images.length > 1 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bg-black/60 px-3 py-1 text-xs text-white"
          style={{ bottom: `max(0.75rem, env(safe-area-inset-bottom))` }}
        >
          {index + 1} / {images.length}
        </div>
      )}
    </div>,
    document.body,
  )
}
